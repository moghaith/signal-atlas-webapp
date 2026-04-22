import "./StatCard.css";

const QUALITY_MAP = {
  rsrp: [
    { min: -80, label: "Excellent", color: "#22c55e" },
    { min: -90, label: "Good", color: "#6b9ae8" },
    { min: -100, label: "Fair", color: "#f59e0b" },
    { min: -Infinity, label: "Poor", color: "#ef4444" },
  ],
  rssi: [
    { min: -65, label: "Excellent", color: "#22c55e" },
    { min: -75, label: "Good", color: "#6b9ae8" },
    { min: -85, label: "Fair", color: "#f59e0b" },
    { min: -Infinity, label: "Poor", color: "#ef4444" },
  ],
  rsrq: [
    { min: -9, label: "Excellent", color: "#22c55e" },
    { min: -12, label: "Good", color: "#6b9ae8" },
    { min: -15, label: "Fair", color: "#f59e0b" },
    { min: -Infinity, label: "Poor", color: "#ef4444" },
  ],
  asu: [
    { min: 30, label: "Excellent", color: "#22c55e" },
    { min: 15, label: "Good", color: "#6b9ae8" },
    { min: 5, label: "Fair", color: "#f59e0b" },
    { min: -Infinity, label: "Poor", color: "#ef4444" },
  ],
};

function getQuality(metric, value) {
  if (value == null) return { label: "N/A", color: "#94a3b8" };
  const thresholds = QUALITY_MAP[metric];
  if (!thresholds) return { label: "", color: "#94a3b8" };
  for (const t of thresholds) {
    if (value >= t.min) return t;
  }
  return { label: "Poor", color: "#ef4444" };
}

function StatCard({ title, value, unit, metric }) {
  const quality = getQuality(metric, value);
  const displayValue = value != null ? value : "—";
  const isAsu = metric === "asu";
  const asuProgress = value != null ? Math.max(0, Math.min(97, Number(value))) : null;

  return (
    <div className="stat-card" style={{ "--card-accent": quality.color }}>
      <div className="stat-card-indicator" />
      <div className="stat-card-content">
        <span className="stat-card-title">{title}</span>
        <div className="stat-card-value-row">
          <span className="stat-card-value">{displayValue}</span>
          <span className="stat-card-unit">{unit}</span>
        </div>
        <span className="stat-card-quality" style={{ color: quality.color }}>
          {quality.label}
        </span>
        {isAsu && (
          <div className="stat-card-progress" aria-label="ASU level">
            <div
              className="stat-card-progress-bar"
              style={{ width: `${asuProgress == null ? 0 : (asuProgress / 97) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default StatCard;