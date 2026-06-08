import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
  Cell,
} from "recharts";
import Select from "react-select";
import { selectStyles } from "../styles/selectStyles";
import "./StatisticsPage.css";
import "../styles/global.css";

const ALL_REGIONS_ID = "__all__";

function getRegionLabel(point) {
  if (point?.region_label) return point.region_label;
  const city = String(point?.city || "").trim();
  const country = String(point?.country || "").trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return "Unknown region";
}

function formatNum(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

// ── Math helpers ──────────────────────────────────────────

function computeStats(values) {
  const valid = values
    .map(Number)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  if (!valid.length) return null;

  const n = valid.length;
  const mean = valid.reduce((s, v) => s + v, 0) / n;

  const median =
    n % 2 === 0
      ? (valid[n / 2 - 1] + valid[n / 2]) / 2
      : valid[Math.floor(n / 2)];

  const variance = valid.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const skewness =
    std === 0
      ? 0
      : valid.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n;

  const q1 = valid[Math.floor(n * 0.25)];
  const q3 = valid[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  const whiskerLo = Math.max(valid[0], q1 - 1.5 * iqr);
  const whiskerHi = Math.min(valid[n - 1], q3 + 1.5 * iqr);
  const outliers = valid.filter((v) => v < whiskerLo || v > whiskerHi);

  return {
    n,
    mean,
    median,
    std,
    skewness,
    min: valid[0],
    max: valid[n - 1],
    q1,
    q3,
    iqr,
    whiskerLo,
    whiskerHi,
    outliers,
  };
}

function buildHistogram(rows, field, min, max, step) {
  const bins = [];
  for (let start = min; start < max; start += step) {
    bins.push({ range: `${start}`, start, count: 0 });
  }
  for (const row of rows) {
    const value = Number(row?.[field]);
    if (!Number.isFinite(value)) continue;
    if (value < min || value >= max) continue;
    const index = Math.floor((value - min) / step);
    if (bins[index]) bins[index].count += 1;
  }
  return bins;
}

// ── Shared chart components ───────────────────────────────

function RoundedBar(props) {
  const { x, y, width, height, fill, stroke } = props;
  if (!height || height <= 0) return null;
  const r = Math.min(5, width / 2, height / 2);
  return (
    <path
      d={`M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} L${x},${y + height} Z`}
      fill={fill}
      fillOpacity={0.75}
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

// ── Stat summary card ─────────────────────────────────────

function StatCard({ label, value, unit, highlight, sub }) {
  return (
    <div
      className={`statistics-stat-card${
        highlight ? " statistics-stat-card--highlight" : ""
      }`}
    >
      <span className="statistics-stat-card-label">{label}</span>
      <span className="statistics-stat-card-value">
        {value}
        {unit && <span className="statistics-stat-card-unit"> {unit}</span>}
      </span>
      {sub && <span className="statistics-stat-card-sub">{sub}</span>}
    </div>
  );
}

function MetricStatsPanel({ title, color, stats, unit }) {
  if (!stats) {
    return (
      <div className="metric-stats-panel">
        <h3 className="metric-stats-title" style={{ borderColor: color }}>{title}</h3>
        <p className="stats-empty">No data available.</p>
      </div>
    );
  }

  const skewLabel =
    Math.abs(stats.skewness) < 0.5
      ? "roughly symmetric"
      : stats.skewness > 0
      ? "right-skewed"
      : "left-skewed";

  return (
    <div className="metric-stats-panel">
      <h3 className="metric-stats-title" style={{ borderLeftColor: color }}>
        {title}
        <span className="metric-stats-n">n = {stats.n.toLocaleString()}</span>
      </h3>
      <div className="statistics-stat-cards-grid">
        <StatCard label="Mean"   value={formatNum(stats.mean, 2)}   unit={unit} highlight />
        <StatCard label="Median" value={formatNum(stats.median, 2)} unit={unit} highlight />
        <StatCard label="Std Dev" value={formatNum(stats.std, 2)}   unit={unit} />
        <StatCard
          label="Skewness"
          value={formatNum(stats.skewness, 3)}
          sub={skewLabel}
        />
        <StatCard label="Min" value={formatNum(stats.min, 2)} unit={unit} />
        <StatCard label="Max" value={formatNum(stats.max, 2)} unit={unit} />
      </div>
    </div>
  );
}

// ── Box plot (pure SVG, custom) ───────────────────────────

function BoxPlot({ stats, color, label, unit, width = 340, height = 200 }) {
  if (!stats) return null;

  const PAD_L = 52, PAD_R = 20, PAD_T = 14, PAD_B = 50;
  const plotW = width - PAD_L - PAD_R;
  const plotH = height - PAD_T - PAD_B;

  // scale: domain = whiskerLo..whiskerHi with 10% padding
  const domainPad = (stats.whiskerHi - stats.whiskerLo) * 0.15 || 5;
  const domainMin = stats.whiskerLo - domainPad;
  const domainMax = stats.whiskerHi + domainPad;
  const scale = (v) =>
    PAD_L + ((v - domainMin) / (domainMax - domainMin)) * plotW;

  // tick positions
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    domainMin + (i / (tickCount - 1)) * (domainMax - domainMin)
  );

  const boxY = PAD_T + plotH * 0.2;
  const boxH = plotH * 0.6;
  const midY = boxY + boxH / 2;

  const MAX_OUTLIERS = 60;
  const outlierSample =
    stats.outliers.length > MAX_OUTLIERS
      ? stats.outliers.filter((_, i) => i % Math.ceil(stats.outliers.length / MAX_OUTLIERS) === 0)
      : stats.outliers;

  return (
    <div className="boxplot-wrap">
        {/* legend */}
        <div className="boxplot-legend">
            <span>
            <i
                className="bl-box"
                style={{ borderColor: color, background: color }}
            />
            IQR (Q1–Q3)
            </span>

            <span>
            <i className="bl-median" style={{ background: color }} />
            Median
            </span>

            <span>
            <i className="bl-mean" style={{ background: color }} />
            Mean
            </span>

            <span>
            <i className="bl-outlier" style={{ borderColor: color }} />
            Outlier
            </span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="boxplot-svg">
        {/* grid lines */}
        {ticks.map((t, i) => (
            <line
            key={i}
            x1={scale(t)} y1={PAD_T}
            x2={scale(t)} y2={PAD_T + plotH}
            stroke="#f1f5f9" strokeWidth={1}
            />
        ))}

        {/* whisker line */}
        <line
            x1={scale(stats.whiskerLo)} y1={midY}
            x2={scale(stats.whiskerHi)} y2={midY}
            stroke={color} strokeWidth={2} strokeOpacity={0.5}
        />

        {/* whisker caps */}
        {[stats.whiskerLo, stats.whiskerHi].map((v, i) => (
            <line
            key={i}
            x1={scale(v)} y1={boxY + boxH * 0.2}
            x2={scale(v)} y2={boxY + boxH * 0.8}
            stroke={color} strokeWidth={2}
            />
        ))}

        {/* IQR box */}
        <rect
            x={scale(stats.q1)}
            y={boxY}
            width={scale(stats.q3) - scale(stats.q1)}
            height={boxH}
            fill={color}
            fillOpacity={0.15}
            stroke={color}
            strokeWidth={2}
            rx={4}
        />

        {/* median line */}
        <line
            x1={scale(stats.median)} y1={boxY}
            x2={scale(stats.median)} y2={boxY + boxH}
            stroke={color} strokeWidth={2.5}
        />

        {/* mean diamond */}
        {(() => {
            const mx = scale(stats.mean);
            const s = 5;
            return (
            <polygon
                points={`${mx},${midY - s} ${mx + s},${midY} ${mx},${midY + s} ${mx - s},${midY}`}
                fill={color}
                fillOpacity={0.9}
            />
            );
        })()}

        {/* outliers */}
        {outlierSample.map((v, i) => (
            <circle
            key={i}
            cx={scale(v)} cy={midY}
            r={3}
            fill="none"
            stroke={color}
            strokeOpacity={0.5}
            strokeWidth={1.5}
            />
        ))}
        {stats.outliers.length > MAX_OUTLIERS && (
        <text
            x={PAD_L + plotW / 2}
            y={PAD_T + plotH + 30}
            textAnchor="middle"
            fontSize={10}
            fill="#94a3b8"
        >
            {stats.outliers.length} outliers (sampled)
        </text>
        )}

        {/* axis ticks */}
        {ticks.map((t, i) => (
            <text
            key={i}
            x={scale(t)} y={PAD_T + plotH + 14}
            textAnchor="middle"
            fontSize={10}
            fill="#94a3b8"
            >
            {t.toFixed(0)}
            </text>
        ))}

        {/* axis label */}
        <text
            x={PAD_L + plotW / 2} y={height - 2}
            textAnchor="middle"
            fontSize={10}
            fill="#94a3b8"
        >
            {unit}
        </text>

        </svg>
  </div>
  );
}

// ── Main page ─────────────────────────────────────────────

function StatisticsPage({ deviceData, apiMode }) {
  const {
    operators,
    networkTypes,
    selectedRegion,
    selectedOperator,
    setSelectedOperator,
    selectedNetworkType,
    setSelectedNetworkType,
    selectedPeriod,
    setSelectedPeriod,
    dataSourceMode,
    setDataSourceMode,
    predictionConfidenceMin,
    setPredictionConfidenceMin,
    heatmapPoints,
    loading,
    error,
    refresh,
  } = deviceData;

  const scopedRows = useMemo(() => {
    if (!selectedRegion || selectedRegion === ALL_REGIONS_ID) return heatmapPoints;
    return heatmapPoints.filter((r) => getRegionLabel(r) === selectedRegion);
  }, [heatmapPoints, selectedRegion]);

  const rsrpValues = useMemo(
    () => scopedRows.map((r) => r.rsrp).filter((v) => v != null),
    [scopedRows]
  );
  const rsrqValues = useMemo(
    () => scopedRows.map((r) => r.rsrq).filter((v) => v != null),
    [scopedRows]
  );

  const rsrpStats = useMemo(() => computeStats(rsrpValues), [rsrpValues]);
  const rsrqStats = useMemo(() => computeStats(rsrqValues), [rsrqValues]);

  const rsrpHistogram = useMemo(
    () => buildHistogram(scopedRows, "rsrp", -130, -43, 5),
    [scopedRows]
  );
  const rsrqHistogram = useMemo(
    () => buildHistogram(scopedRows, "rsrq", -25, -3, 2),
    [scopedRows]
  );

  return (
    <div className="page">
      <main className="page-content">

        <section className="page-intro">
          <h2>Data Statistics</h2>
          <p>
            Descriptive statistics, distribution analysis, and box plots for
            signal quality metrics across the selected region and time period.
          </p>
        </section>

        {/* ── Filters ── */}
        <section className="map-filters">
          <div className="map-toggle">
            <span>Operator</span>
            <Select
              value={operators.map((o) => ({ value: o.id, label: o.label })).find((o) => o.value === selectedOperator)}
              onChange={(opt) => setSelectedOperator(opt?.value)}
              options={operators.map((o) => ({ value: o.id, label: o.label }))}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>
          <div className="map-toggle">
            <span>Network type</span>
            <Select
              value={networkTypes.map((n) => ({ value: n.id, label: n.label })).find((o) => o.value === selectedNetworkType)}
              onChange={(opt) => setSelectedNetworkType(opt?.value)}
              options={networkTypes.map((n) => ({ value: n.id, label: n.label }))}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>
          <div className="map-toggle">
            <span>Period</span>
            <Select
              value={[
                { value: "24h", label: "Last 24h" },
                { value: "week", label: "Last week" },
                { value: "month", label: "Last month" },
                { value: "all", label: "All history" },
              ].find((o) => o.value === selectedPeriod)}
              onChange={(opt) => setSelectedPeriod(opt?.value)}
              options={[
                { value: "24h", label: "Last 24h" },
                { value: "week", label: "Last week" },
                { value: "month", label: "Last month" },
                { value: "all", label: "All history" },
              ]}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>
          <div className="map-toggle">
            <span>Data source</span>
            <Select
              value={[
                { value: "crowdsourced", label: "Crowdsourced only" },
                { value: "predicted", label: "ML model (predicted)" },
                { value: "both", label: "Both" },
              ].find((o) => o.value === dataSourceMode)}
              onChange={(opt) => setDataSourceMode(opt?.value)}
              options={[
                { value: "crowdsourced", label: "Crowdsourced only" },
                { value: "predicted", label: "ML model (predicted)" },
                { value: "both", label: "Both" },
              ]}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>
          {(dataSourceMode === "predicted" || dataSourceMode === "both") && (
            <div className="map-toggle">
              <span>Min confidence</span>
              <Select
                value={[
                  { value: 0, label: "Any" },
                  { value: 0.5, label: "50%+" },
                  { value: 0.7, label: "70%+" },
                  { value: 0.85, label: "85%+" },
                ].find((o) => o.value === predictionConfidenceMin)}
                onChange={(opt) => setPredictionConfidenceMin(opt?.value)}
                options={[
                  { value: 0, label: "Any" },
                  { value: 0.5, label: "50%+" },
                  { value: 0.7, label: "70%+" },
                  { value: 0.85, label: "85%+" },
                ]}
                isSearchable={false}
                styles={selectStyles}
              />
            </div>
          )}
        </section>

        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
            <button onClick={refresh}>Retry</button>
          </div>
        )}

        {loading && (
          <div className="stats-loading">Computing statistics…</div>
        )}

        {!loading && (
          <>
            {/* ── Summary stat cards ── */}
            <section className="stats-section-head">
              <h3>Descriptive Statistics</h3>
              <p>Summary statistics computed from all readings in the current filter scope.</p>
            </section>

            <div className="stats-panels-grid">
              <MetricStatsPanel
                title="RSRP"
                color="#2563eb"
                stats={rsrpStats}
                unit="dBm"
              />
              <MetricStatsPanel
                title="RSRQ"
                color="#7c3aed"
                stats={rsrqStats}
                unit="dB"
              />
            </div>

            {/* ── Distributions ── */}
            <section className="stats-section-head">
              <h3>Signal Distribution</h3>
              <p>Histogram views for RSRP and RSRQ to inspect spread and outliers.</p>
            </section>

            <div className="stats-two-col">
              <div className="chart-card">
                <h3 className="chart-card-title">RSRP Distribution (dBm)</h3>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={rsrpHistogram} margin={{ top: 8, right: 8, left: -10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "rgba(37,99,235,0.07)" }} />
                    <Bar dataKey="count" shape={<RoundedBar fill="#2563eb" stroke="#1d4ed8" />} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card">
                <h3 className="chart-card-title">RSRQ Distribution (dB)</h3>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={rsrqHistogram} margin={{ top: 8, right: 8, left: -10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "rgba(124,58,237,0.07)" }} />
                    <Bar dataKey="count" shape={<RoundedBar fill="#7c3aed" stroke="#6d28d9" />} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Box plots ── */}
            <section className="stats-section-head">
              <h3>Box Plots</h3>
              <p>
                Whiskers extend to 1.5× IQR. The median line and mean diamond are shown separately.
                Points beyond the whiskers are plotted as outliers.
              </p>
            </section>

            <div className="stats-two-col">
              <div className="chart-card">
                <h3 className="chart-card-title">RSRP Box Plot (dBm)</h3>
                {rsrpStats ? (
                  <div className="boxplot-wrap">
                    <BoxPlot stats={rsrpStats} color="#2563eb" label="RSRP" unit="dBm" width={480} height={180} />
                    <div className="boxplot-summary">
                      <span>Q1: <strong>{formatNum(rsrpStats.q1, 1)}</strong></span>
                      <span>Median: <strong>{formatNum(rsrpStats.median, 1)}</strong></span>
                      <span>Q3: <strong>{formatNum(rsrpStats.q3, 1)}</strong></span>
                      <span>IQR: <strong>{formatNum(rsrpStats.iqr, 1)}</strong></span>
                      <span>Outliers: <strong>{rsrpStats.outliers.length.toLocaleString()}</strong></span>
                    </div>
                  </div>
                ) : (
                  <p className="stats-empty">No RSRP data available.</p>
                )}
              </div>

              <div className="chart-card">
                <h3 className="chart-card-title">RSRQ Box Plot (dB)</h3>
                {rsrqStats ? (
                  <div className="boxplot-wrap">
                    <BoxPlot stats={rsrqStats} color="#7c3aed" label="RSRQ" unit="dB" width={480} height={180} />
                    <div className="boxplot-summary">
                      <span>Q1: <strong>{formatNum(rsrqStats.q1, 1)}</strong></span>
                      <span>Median: <strong>{formatNum(rsrqStats.median, 1)}</strong></span>
                      <span>Q3: <strong>{formatNum(rsrqStats.q3, 1)}</strong></span>
                      <span>IQR: <strong>{formatNum(rsrqStats.iqr, 1)}</strong></span>
                      <span>Outliers: <strong>{rsrqStats.outliers.length.toLocaleString()}</strong></span>
                    </div>
                  </div>
                ) : (
                  <p className="stats-empty">No RSRQ data available.</p>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default StatisticsPage;
