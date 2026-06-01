import { useEffect, useState } from "react";
import {
  Wallet, Monitor, ChevronLeft, ChevronRight,
  Trash2, AlertTriangle, LogOut, ArrowDownToLine, CreditCard,
  Edit3, Check, X
} from "lucide-react";
import { useAuth } from "../AuthContext";
import {
  getWalletDetails,
  getWalletTransactions,
  getUserSamplesCount,
  deleteUserSamples,
  updateProfile,
} from "../data/profileService";
import "./ProfilePage.css";

const TX_PAGE_SIZE = 20;

const TX_TYPE_STYLES = {
  CONTRIBUTION: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  WITHDRAWAL:   { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  ADJUSTMENT:   { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
};

function txStyle(type) {
  return TX_TYPE_STYLES[type] || { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" };
}

// ─── Reusable dialog ──────────────────────────────────────────────────────────
function Dialog({ onBackdropClick, icon, iconColor = "#dc2626", title, children }) {
  return (
    <div className="cr-overlay" onClick={onBackdropClick}>
      <div className="cr-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="cr-dialog-header">
          <div className="cr-dialog-icon" style={{ color: iconColor }}>{icon}</div>
          <h4 className="cr-dialog-title">{title}</h4>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProfilePage( {onLoginClick } ) {
  const { profile, logout, refreshProfile } = useAuth();

  const [wallet,       setWallet]       = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txPage,       setTxPage]       = useState(0);
  const [txLoading,    setTxLoading]    = useState(true);

  const [deviceSamples,  setDeviceSamples]  = useState({});
  const [samplesLoading, setSamplesLoading] = useState(true);

  // delete dialog
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState(null);

  // withdraw dialog
  const [showWithdraw,    setShowWithdraw]    = useState(false);
  const [withdrawAmount,  setWithdrawAmount]  = useState("");
  const [withdrawing,     setWithdrawing]     = useState(false);
  const [withdrawError,   setWithdrawError]   = useState(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  // editing username
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState(null);

  const [error, setError] = useState(null);

  useEffect(() => {
    if (!profile) return;
    setTxLoading(true);
    Promise.all([
      getWalletDetails(profile.id),
      getWalletTransactions(profile.id, 500),
    ])
      .then(([w, txData]) => {
        setWallet(w);
        setTransactions(txData?.transactions || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setTxLoading(false));
  }, [profile]);

  useEffect(() => {
    loadDeviceSamples();
  }, [profile]);

  useEffect(() => {
    if (profile?.username) {
      setNewUsername(profile.username);
    }
  }, [profile]);

  const loadDeviceSamples = async () => {
    if (!profile?.device_ids?.length) {
      setDeviceSamples({});
      return;
    }

    setSamplesLoading(true);

    try {
      const results = await Promise.all(
        profile.device_ids.map((did) =>
          getUserSamplesCount(did)
            .then((r) => ({ did, count: r?.total_samples_count ?? 0 }))
            .catch(() => ({ did, count: "—" }))
        )
      );

      const map = {};
      results.forEach(({ did, count }) => {
        map[did] = count;
      });

      setDeviceSamples(map);
    } finally {
      setSamplesLoading(false);
    }
  };

  const handleDeleteSamples = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteUserSamples(deleteTarget);

      setDeleteTarget(null);

      await loadDeviceSamples();

    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleWithdraw = async () => {
      const amount = Number(withdrawAmount);
      if (!amount || amount <= 0) { setWithdrawError("Enter a valid amount."); return; }
      const available = wallet ? Number(wallet.credits) : 0;
      if (amount > available) { setWithdrawError(`Cannot exceed available balance of ${available.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP.`); return; }
      setWithdrawing(true);
      setWithdrawError(null);
      try {
        // TODO: wire to actual withdrawal API
        await new Promise((r) => setTimeout(r, 800)); // placeholder
        setWithdrawSuccess(true);
        setWallet((w) => w ? { ...w, credits: (Number(w.credits) - amount).toFixed(2) } : w);
      } catch (err) {
        setWithdrawError(err.message);
      } finally {
        setWithdrawing(false);
      }
    };

    const handleSaveUsername = async () => {
    if (!newUsername.trim()) return;

    setSavingUsername(true);
    setUsernameError(null);

    try {
      const updatedProfile = await updateProfile(profile.id, {
        username: newUsername.trim(),
      });

      // update global auth state
      refreshProfile(updatedProfile);

      setEditingUsername(false);
    } catch (err) {
      setUsernameError(err.message);
    } finally {
      setSavingUsername(false);
    }
  };

  const openWithdraw = () => {
    setWithdrawAmount("");
    setWithdrawError(null);
    setWithdrawSuccess(false);
    setShowWithdraw(true);
  };

  if (!profile) return (
    <main className="page-content pp-page">
      <div className="pp-signed-out">
        <h2>You’re signed out</h2>
        <p>Please sign in to access your profile.</p>

        <button
          className="pp-login-btn"
          onClick={onLoginClick}
        >
          Login
        </button>
      </div>
    </main>
  );

  const txTotalPages = Math.ceil(transactions.length / TX_PAGE_SIZE);
  const txSlice = transactions.slice(txPage * TX_PAGE_SIZE, (txPage + 1) * TX_PAGE_SIZE);
  const availableBalance = wallet ? Number(wallet.credits) : 0;

  return (
    <main className="page-content pp-page">

      <section className="page-intro">
        <h2>My Profile</h2>
        <p>Manage your account, review transactions, and track your registered devices.</p>
      </section>

      {/* ── Hero ── */}
      <section className="pp-hero">

        {/* Card 1: Profile */}
        <div className="pp-card pp-profile-card">

          <div className="pp-profile-top">

            <div className="pp-profile-left">
              <div className="pp-avatar">
                {profile.username?.[0]?.toUpperCase()}
              </div>

              <div className="pp-hero-info">

                <div className="pp-username-row">
                  {!editingUsername ? (
                    <>
                      <h2 className="pp-username">{profile.username}</h2>

                      <button
                        className="pp-edit-btn"
                        onClick={() => {
                          setEditingUsername(true);
                          setNewUsername(profile.username);
                        }}
                        title="Edit username"
                      >
                        <Edit3 size={14} />
                      </button>
                    </>
                  ) : (
                    <div className="pp-username-edit">
                      <input
                        className="pp-username-input"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        autoFocus
                      />

                      <button
                        className="pp-save-btn"
                        onClick={handleSaveUsername}
                        disabled={savingUsername}
                        title="Save"
                      >
                        <Check size={16} />
                      </button>

                      <button
                        className="pp-cancel-btn"
                        onClick={() => {
                          setEditingUsername(false);
                          setNewUsername(profile.username);
                        }}
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>

                <span className="pp-since">
                  Member since {new Date(profile.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <button className="pp-logout-btn" onClick={logout}>
              <LogOut size={14} />
              Sign out
            </button>

          </div>

        </div>

        {/* Card 2: Wallet */}
        <div className="pp-card pp-wallet-card">

          <div className="pp-wallet-top">

            <div className="pp-wallet-info">
              <div className="pp-credits-top">
                <CreditCard size={14} className="pp-credits-icon" />
                <span className="pp-credits-label">Available balance</span>
              </div>

              <div className="pp-credits-amount">
                <span className="pp-credits-value">
                  {wallet
                    ? availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })
                    : "—"}
                </span>
                <span className="pp-credits-unit">EGP</span>
              </div>
            </div>

            <button
              className="pp-withdraw-btn"
              onClick={openWithdraw}
              disabled={!wallet || availableBalance <= 0}
            >
              <ArrowDownToLine size={13} />
              Withdraw
            </button>

          </div>

        </div>

      </section>

      {error && <div className="cr-error-banner">{error}</div>}

      {/* ── Transactions ── */}
      <section className="pp-section">
        <div className="pp-section-head">
          <Wallet size={15} />
          <h3>Transaction History</h3>
          {wallet && <span className="pp-section-count">{wallet.transaction_count} total</span>}
        </div>

        {txLoading ? (
          <div className="cr-loading">Loading transactions…</div>
        ) : transactions.length === 0 ? (
          <div className="pp-empty-state">
            <Wallet size={28} className="pp-empty-icon" />
            <p>No transactions yet.</p>
          </div>
        ) : (
          <>
            <div className="pp-tx-table">
              <div className="pp-tx-header">
                <span>Type</span>
                <span>Description</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Date</span>
              </div>
              {txSlice.map((tx) => {
                const s = txStyle(tx.transaction_type);
                const positive = Number(tx.amount) >= 0;
                return (
                  <div key={tx.id} className="pp-tx-row">
                    <span>
                      <span className="pp-tx-type-badge" style={{ background: s.bg, color: s.text, borderColor: s.border }}>
                        {tx.transaction_type}
                      </span>
                    </span>
                    <span className="pp-tx-desc">{tx.description || "—"}</span>
                    <span className={`pp-tx-amount ${positive ? "positive" : "negative"}`}>
                      {positive ? "+" : ""}{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
                    </span>
                    <span className="pp-tx-status">{tx.status}</span>
                    <span className="pp-tx-date">{new Date(tx.created_at).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>

            {txTotalPages > 1 && (
              <div className="pp-pagination">
                <button className="pp-page-btn" onClick={() => setTxPage((p) => Math.max(0, p - 1))} disabled={txPage === 0}>
                  <ChevronLeft size={15} />
                </button>
                <span className="pp-page-info">Page {txPage + 1} of {txTotalPages}</span>
                <button className="pp-page-btn" onClick={() => setTxPage((p) => Math.min(txTotalPages - 1, p + 1))} disabled={txPage === txTotalPages - 1}>
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Devices ── */}
      <section className="pp-section">
        <div className="pp-section-head">
          <Monitor size={15} />
          <h3>Registered Devices</h3>
          <span className="pp-section-count">{profile.device_ids?.length || 0} devices</span>
        </div>

        {!profile.device_ids?.length ? (
          <div className="pp-empty-state">
            <Monitor size={28} className="pp-empty-icon" />
            <p>No devices registered to this account.</p>
          </div>
        ) : (
          <div className="pp-devices-table">
            <div className="pp-device-header">
              <span>Device ID</span>
              <span>Total samples</span>
              <span></span>
            </div>
            {profile.device_ids.map((did) => (
              <div key={did} className="pp-device-row">
                <span className="pp-device-id">{did}</span>
                <span className="pp-device-samples">
                  {samplesLoading ? (
                    <span className="pp-samples-loading">…</span>
                  ) : typeof deviceSamples[did] === "number" ? (
                    <span className="pp-samples-count">{deviceSamples[did].toLocaleString()}</span>
                  ) : "—"}
                </span>
                <button
                  className="pp-device-delete-btn"
                  title="Delete all samples from this device"
                  onClick={() => { setDeleteTarget(did); setDeleteError(null); }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Delete samples dialog ── */}
      {deleteTarget && (
        <Dialog
          onBackdropClick={() => { if (!deleting) setDeleteTarget(null); }}
          icon={<AlertTriangle size={20} />}
          iconColor="#dc2626"
          title="Delete samples"
        >
          <p className="cr-dialog-body">
            All readings from <code className="pp-code">{deleteTarget}</code> that are not linked
            to a coverage request will be permanently removed. This cannot be undone.
          </p>
          {deleteError && <div className="cr-dialog-error">{deleteError}</div>}
          <div className="cr-dialog-actions">
            <button className="cr-btn cr-btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </button>
            <button className="cr-btn cr-btn-danger" onClick={handleDeleteSamples} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete samples"}
            </button>
          </div>
        </Dialog>
      )}

      {/* ── Withdraw dialog ── */}
      {showWithdraw && (
        <Dialog
          onBackdropClick={() => { if (!withdrawing) setShowWithdraw(false); }}
          icon={<ArrowDownToLine size={20} />}
          iconColor="#2563eb"
          title="Withdraw funds"
        >
          {withdrawSuccess ? (
            <>
              <p className="cr-dialog-body pp-withdraw-success">
                ✓ Withdrawal submitted successfully.
              </p>
              <div className="cr-dialog-actions">
                <button className="cr-btn cr-btn-primary" onClick={() => setShowWithdraw(false)}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="cr-dialog-body">
                Available balance:{" "}
                <strong>{availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</strong>
              </p>
              <div className="pp-withdraw-field">
                <label className="cr-label">Amount (EGP)</label>
                <div className="pp-withdraw-input-wrap">
                  <input
                    className="cr-input pp-withdraw-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={availableBalance}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                  />
                  <button
                    className="pp-withdraw-max-btn"
                    type="button"
                    onClick={() => setWithdrawAmount(String(availableBalance))}
                  >
                    Max
                  </button>
                </div>
              </div>
              {withdrawError && <div className="cr-dialog-error">{withdrawError}</div>}
              <div className="cr-dialog-actions">
                <button className="cr-btn cr-btn-secondary" onClick={() => setShowWithdraw(false)} disabled={withdrawing}>
                  Cancel
                </button>
                <button
                  className="cr-btn cr-btn-primary"
                  onClick={handleWithdraw}
                  disabled={withdrawing || !withdrawAmount || Number(withdrawAmount) <= 0}
                >
                  {withdrawing ? "Processing…" : "Confirm withdrawal"}
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </main>
  );
}
