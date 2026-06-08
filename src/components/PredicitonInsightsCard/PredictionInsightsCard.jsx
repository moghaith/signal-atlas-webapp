import "./PredictionInsightsCard.css";
import { XCircle } from "lucide-react";

function formatNum(v, digits = 1) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(digits);
}

const CONF_LEVELS = [
  { min: 0.85, label: "High",   color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0" },
  { min: 0.65, label: "Medium", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  { min: 0,    label: "Low",    color: "#ef4444", bg: "#fef2f2", border: "#fecaca" },
];

function getLevel(confidence) {
  if (confidence == null) return null;
  return CONF_LEVELS.find(l => confidence >= l.min) ?? CONF_LEVELS[CONF_LEVELS.length - 1];
}

function ConfBadge({ confidence }) {
  const level = getLevel(confidence);
  if (!level) return <span className="pi-badge pi-badge--none">No data</span>;
  return (
    <span
      className="pi-badge"
      style={{ color: level.color, background: level.bg, borderColor: level.border }}
    >
      {level.label} · {Math.round(confidence * 100)}%
    </span>
  );
}

function MiniBar({ value, color }) {
  const pct = value != null ? Math.round(value * 100) : null;
  return (
    <div className="pi-bar-track">
      {pct != null && (
        <div className="pi-bar-fill" style={{ width: `${pct}%`, background: color }} />
      )}
    </div>
  );
}

function MetricConfRow({ label, confidence, uncertainty, unit, color }) {
  const pct = confidence != null ? Math.round(confidence * 100) : null;
  return (
    <div className="pi-metric-row">
      <span className="pi-metric-label">{label}</span>
      <div className="pi-metric-right">
        <MiniBar value={confidence} color={color} />
        <span className="pi-metric-pct" style={{ color: getLevel(confidence)?.color ?? "#94a3b8" }}>
          {pct != null ? `${pct}%` : "—"}
        </span>
        {uncertainty != null && (
          <span className="pi-metric-uncert">±{formatNum(uncertainty, 2)} {unit}</span>
        )}
      </div>
    </div>
  );
}

export default function PredictionInsights({ predictionPoints }) {
  if (!predictionPoints?.length) {
    return (
      <div className="pi-card pi-card--empty">
        <XCircle className="pi-empty-icon" />
        <p className="pi-empty-text">No ML predictions available for the current filters.</p>
        <p className="pi-empty-sub">Switch Data source to "ML model" or "Both" to see predictions.</p>
      </div>
    );
  }

  const n = predictionPoints.length;

  // Per-metric stats across all prediction points
  const rsrpConfs = predictionPoints.map(p => p.rsrp_confidence).filter(v => v != null);
  const rsrqConfs = predictionPoints.map(p => p.rsrq_confidence).filter(v => v != null);
  const combined  = predictionPoints.map(p => p.prediction_confidence).filter(v => v != null);

  const rsrpUncerts = predictionPoints.map(p => p.rsrp_uncertainty).filter(v => v != null);
  const rsrqUncerts = predictionPoints.map(p => p.rsrq_uncertainty).filter(v => v != null);

  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  const avgCombined  = avg(combined);
  const avgRsrpConf  = avg(rsrpConfs);
  const avgRsrqConf  = avg(rsrqConfs);
  const avgRsrpUncert = avg(rsrpUncerts);
  const avgRsrqUncert = avg(rsrqUncerts);

  // Confidence distribution
  const high   = combined.filter(v => v >= 0.85).length;
  const medium = combined.filter(v => v >= 0.65 && v < 0.85).length;
  const low    = combined.filter(v => v < 0.65).length;
  const total  = combined.length || 1;

  const overallLevel = getLevel(avgCombined);

  return (
    <div className="pi-card">
      {/* Header */}
      <div className="pi-header">
        <div className="pi-title-row">
          <span className="pi-title">ML Prediction Insights</span>
          <ConfBadge confidence={avgCombined} />
        </div>
        <p className="pi-subtitle">{n.toLocaleString()} predicted samples in current view</p>
      </div>

      {/* Overall confidence bar */}
      <div className="pi-section">
        <div className="pi-section-label">Overall Confidence</div>
        <div className="pi-overall-bar-track">
          <div
            className="pi-overall-bar-fill"
            style={{
              width: avgCombined != null ? `${Math.round(avgCombined * 100)}%` : "0%",
              background: overallLevel?.color ?? "#94a3b8",
            }}
          />
        </div>
        <div className="pi-overall-pct">
          {avgCombined != null ? `${Math.round(avgCombined * 100)}%` : "—"}
        </div>
      </div>

      {/* Per-metric confidence */}
      <div className="pi-section">
        <div className="pi-section-label">Per-Metric Confidence</div>
        <div className="pi-metrics">
          <MetricConfRow
            label="RSRP"
            confidence={avgRsrpConf}
            uncertainty={avgRsrpUncert}
            unit="dBm"
            color={getLevel(avgRsrpConf)?.color ?? "#94a3b8"}
          />
          <MetricConfRow
            label="RSRQ"
            confidence={avgRsrqConf}
            uncertainty={avgRsrqUncert}
            unit="dB"
            color={getLevel(avgRsrqConf)?.color ?? "#94a3b8"}
          />
        </div>
      </div>

      {/* Confidence distribution */}
      <div className="pi-section">
        <div className="pi-section-label">Confidence Distribution</div>
        <div className="pi-dist-bar">
          {high   > 0 && <div style={{ width: `${(high / total) * 100}%`,   background: "#22c55e" }} title={`High: ${high}`} />}
          {medium > 0 && <div style={{ width: `${(medium / total) * 100}%`, background: "#f59e0b" }} title={`Medium: ${medium}`} />}
          {low    > 0 && <div style={{ width: `${(low / total) * 100}%`,    background: "#ef4444" }} title={`Low: ${low}`} />}
        </div>
        <div className="pi-dist-legend">
          <span><i style={{ background: "#22c55e" }} />High <strong>{high}</strong></span>
          <span><i style={{ background: "#f59e0b" }} />Medium <strong>{medium}</strong></span>
          <span><i style={{ background: "#ef4444" }} />Low <strong>{low}</strong></span>
        </div>
      </div>
    </div>
  );
}
