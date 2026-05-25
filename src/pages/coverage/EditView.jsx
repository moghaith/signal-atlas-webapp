import { useEffect, useState } from "react";
import {
  getCoverageRequest,
  updateCoverageRequest,
} from "../../data/coverageRequestService";

export default function EditView({ id, onBack, onSaved }) {
  const [form,       setForm]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);
  const [saveError,  setSaveError]  = useState(null);
  const [originalReward, setOriginalReward] = useState(null);
  const [currentDensity, setCurrentDensity] = useState(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getCoverageRequest(id)
      .then((req) => {
        setForm({
          title:                req.title,
          description:          req.description || "",
          country:              req.country || "",
          city:                 req.city || "",
          target_density_score: String(req.target_density_score),
          reward_amount:        String(req.reward_amount),
          status:               req.status,
        });
        setOriginalReward(Number(req.reward_amount));
        setCurrentDensity(Number(req.current_density_score));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);


  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        title:                form.title.trim(),
        description:          form.description.trim() || null,
        country:              form.country.trim() || null,
        city:                 form.city.trim() || null,
        target_density_score: Number(form.target_density_score),
        reward_amount:        Number(form.reward_amount),
        status:               form.status,
      };
      await updateCoverageRequest(id, payload);
      onSaved();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="cr-loading">Loading…</div>;
  if (error)   return <div className="cr-error-banner">{error}</div>;
  if (!form)   return null;

  
  const rewardNum = Number(form?.reward_amount);
  const rewardDecreased = originalReward !== null && rewardNum < originalReward;

  const targetNum = Number(form.target_density_score);
  const densityTooLow = currentDensity !== null && targetNum < currentDensity;

  const canSave = form.title.trim() &&
                targetNum > 0 &&
                rewardNum > 0 &&
                !rewardDecreased &&
                !densityTooLow;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };


  return (
    <div className="cr-edit-view">
      <div className="cr-detail-header">
        <button className="cr-back-btn" onClick={onBack}>← Back</button>
        <h3>Edit Request</h3>
      </div>

      <div className="cr-form-grid">
        <div className="cr-form-group cr-span-2">
          <label className="cr-label">Title <span className="cr-required">*</span></label>
          <input className="cr-input" name="title" value={form.title} onChange={handleChange} maxLength={255} />
        </div>

        <div className="cr-form-group cr-span-2">
          <label className="cr-label">Description</label>
          <textarea className="cr-input cr-textarea" name="description" value={form.description} onChange={handleChange} rows={3} />
        </div>

        <div className="cr-form-group">
          <label className="cr-label">Country</label>
          <input className="cr-input" name="country" value={form.country} onChange={handleChange} maxLength={100} />
        </div>

        <div className="cr-form-group">
          <label className="cr-label">City</label>
          <input className="cr-input" name="city" value={form.city} onChange={handleChange} maxLength={100} />
        </div>

        <div className="cr-form-group">
          <label className="cr-label">Target density score <span className="cr-required">*</span></label>
          <input
            className={`cr-input${densityTooLow ? " cr-input-error" : ""}`}
            name="target_density_score"
            type="number"
            min={currentDensity ?? 0}
            step="0.1"
            value={form.target_density_score}
            onChange={handleChange}
          />
          
          {densityTooLow && (
            <span className="cr-field-error">
              Target density cannot be lower than current density (
              {currentDensity.toFixed(2)})
            </span>
          )}
        </div>

        <div className="cr-form-group">
          <label className="cr-label">Reward amount (EGP) <span className="cr-required">*</span></label>
          <input
            className={`cr-input${rewardDecreased ? " cr-input-error" : ""}`}
            name="reward_amount"
            type="number"
            min={originalReward ?? 0}
            step="0.01"
            value={form.reward_amount}
            onChange={handleChange}
          />
          {rewardDecreased && (
            <span className="cr-field-error">
              Reward can only be increased — current minimum is {Number(originalReward).toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP
            </span>
          )}
        </div>

        <div className="cr-form-group">
          <label className="cr-label">Status</label>
          <select className="cr-input cr-select" name="status" value={form.status} onChange={handleChange}>
            <option value="OPEN">Open</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="cr-area-notice">
        ⚠ Coverage area cannot be changed after creation.
      </div>

      {saveError && <div className="cr-submit-error">{saveError}</div>}

      <div className="cr-form-footer">
        <button className="cr-btn cr-btn-primary" onClick={handleSave} disabled={!canSave || saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button className="cr-btn cr-btn-secondary" onClick={onBack}>Cancel</button>
      </div>
    </div>
  );
}
