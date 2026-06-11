import { useEffect, useState } from "react";
import { Trash2, Target, Banknote, AlertTriangle, User } from "lucide-react";
import Select from "react-select";
import { selectStyles } from "../../styles/selectStyles";
import { useAuth } from "../../contexts/AuthContext";
import { getCoverageRequests, updateCoverageRequest } from "../../data/coverageRequestService";

const STATUS_COLORS = {
  OPEN:      { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  COMPLETED: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  CANCELLED: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
};

export default function ListView({ onSelect, onCreate }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [filters,  setFilters]  = useState({ status: "", country: "", city: "", sort_by: "" });

  const [cancelTarget, setCancelTarget] = useState(null); // { id, title }
  const [cancelling, setCancelling]     = useState(false);
  const [cancelError, setCancelError]   = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCoverageRequests({
        status:  filters.status  || undefined,
        country: filters.country || undefined,
        city:    filters.city    || undefined,
        sort_by: filters.sort_by || undefined,
      });
      setRequests(Array.isArray(data) ? data : (data?.requests || []));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((f) => ({ ...f, [name]: value }));
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await updateCoverageRequest(cancelTarget.id, { status: "CANCELLED" });
      setCancelTarget(null);
      load(); // refresh list
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="cr-list-view">
      <div className="cr-list-toolbar">
        <div className="cr-filters">
          <Select
            menuPortalTarget={document.body}
            value={
                [
                { value: "", label: "All statuses" },
                { value: "OPEN", label: "Open" },
                { value: "COMPLETED", label: "Completed" },
                { value: "CANCELLED", label: "Cancelled" }
                ].find((o) => o.value === filters.status) || null
            }
            onChange={(opt) =>
                setFilters((prev) => ({
                ...prev,
                status: opt?.value || ""
                }))
            }
            options={[
                { value: "", label: "All statuses" },
                { value: "OPEN", label: "Open" },
                { value: "COMPLETED", label: "Completed" },
                { value: "CANCELLED", label: "Cancelled" }
            ]}
            isSearchable={false}
            styles={selectStyles}
          />
          <input className="cr-input cr-filter-input" name="country" value={filters.country} onChange={handleFilterChange} placeholder="Country…" />
          <input className="cr-input cr-filter-input" name="city"    value={filters.city}    onChange={handleFilterChange} placeholder="City…" />
          <Select
            menuPortalTarget={document.body}
            value={
                [
                { value: "", label: "Sort: default" },
                { value: "created_at", label: "Newest" },
                { value: "reward_amount", label: "Reward" },
                { value: "progress", label: "Progress" }
                ].find((o) => o.value === filters.sort_by) || null
            }
            onChange={(opt) =>
                setFilters((prev) => ({
                ...prev,
                sort_by: opt?.value || ""
                }))
            }
            options={[
                { value: "", label: "Sort: default" },
                { value: "created_at", label: "Newest" },
                { value: "reward_amount", label: "Reward" },
                { value: "progress", label: "Progress" }
            ]}
            isSearchable={false}
            styles={selectStyles}
          />
        </div>
        <button className="cr-btn cr-btn-primary" onClick={onCreate}>+ New request</button>
      </div>

      {error && <div className="cr-error-banner">{error} <button onClick={load}>Retry</button></div>}

      {loading && <div className="cr-loading">Loading requests…</div>}

      {!loading && !error && requests.length === 0 && (
        <div className="cr-empty">No coverage requests match your filters.</div>
      )}

      <div className="cr-cards-grid">
        {requests.map((req) => {
          const sc = STATUS_COLORS[req.status] || STATUS_COLORS.OPEN;
          const progress = req.target_density_score > 0
            ? Math.min(100, (req.current_density_score / req.target_density_score) * 100)
            : 0;
          const isCancellable = req.status === "OPEN" && user && req.created_by === user.id;

          return (
            <div key={req.id} className="cr-card" onClick={() => onSelect(req.id)}>
              <div className="cr-card-head">
                <span className="cr-card-title">{req.title}</span>
                <div className="cr-card-head-right">
                  <span
                    className="cr-status-badge"
                    style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}
                  >
                    {req.status}
                  </span>
                  {isCancellable && (
                    <button
                      className="cr-cancel-btn"
                      title="Cancel request"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCancelTarget({ id: req.id, title: req.title });
                        setCancelError(null);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <span className="cr-card-location">
                <User size={12} />
                {req.created_by_display ?? req.created_by ?? "—"}
              </span>

              {(req.city || req.country) && (
                <span className="cr-card-location">
                  {[req.city, req.country].filter(Boolean).join(", ")}
                </span>
              )}

              <div className="cr-card-progress">
                <div className="cr-progress-bar">
                  <div className="cr-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="cr-progress-label">{progress.toFixed(1)}%</span>
              </div>

              <div className="cr-card-meta">
                <span className="cr-meta-item">
                  <Target size={14} />
                  {req.target_density_score} target density
                </span>
                <span className="cr-meta-item">
                  <Banknote size={14} />
                  {Number(req.reward_amount).toLocaleString()} EGP
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Cancel confirmation popup ── */}
      {cancelTarget && (
        <div
          className="cr-overlay"
          onClick={() => {
            if (!cancelling) setCancelTarget(null);
          }}
        >
          <div className="cr-dialog" onClick={(e) => e.stopPropagation()}>
            
            {/* NEW HEADER ROW */}
            <div className="cr-dialog-header">
              <div className="cr-dialog-icon">
                <AlertTriangle size={22} />
              </div>

              <h4 className="cr-dialog-title">
                Cancel request
              </h4>
            </div>

            <p className="cr-dialog-body">
              <strong>"{cancelTarget.title}"</strong> will be marked as{" "}
              <span className="cr-dialog-cancelled">CANCELLED</span> and closed to
              new contributors.
            </p>

            {cancelError && (
              <div className="cr-dialog-error">{cancelError}</div>
            )}

            <div className="cr-dialog-actions">
              <button
                className="cr-btn cr-btn-secondary"
                onClick={() => setCancelTarget(null)}
                disabled={cancelling}
              >
                Keep it
              </button>

              <button
                className="cr-btn cr-btn-danger"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? "Cancelling…" : "Yes, cancel request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
