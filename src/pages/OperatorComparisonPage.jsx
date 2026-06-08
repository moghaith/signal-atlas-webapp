import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";
import Header from "../components/Header/Header";
import useDeviceData from "../hooks/useDeviceData";
import "../components/charts/SignalCharts.css";
import "./ComparisonPage.css";

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

function formatNumber(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const OPERATOR_COLORS = ["#2563eb", "#7c3aed", "#16a34a", "#dc2626", "#ea580c", "#0891b2", "#ca8a04"];

function bucketSizeForPeriod(period) {
  if (period === "24h") return 30 * 60 * 1000;
  if (period === "week") return 60 * 60 * 1000;
  if (period === "month") return 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function aggregateOperatorTrend(rows, period) {
  const bucketMs = bucketSizeForPeriod(period);
  const buckets = new Map();

  for (const row of rows) {
    const ts = new Date(row?.timestamp || 0).getTime();
    if (!Number.isFinite(ts)) continue;

    const start = Math.floor(ts / bucketMs) * bucketMs;
    const entry = buckets.get(start) || {
      ts: start,
      rsrpSum: 0,
      rsrpCount: 0,
      rsrpGood: 0,
    };

    if (row?.rsrp != null && Number.isFinite(Number(row.rsrp))) {
      const rsrp = Number(row.rsrp);
      entry.rsrpSum += rsrp;
      entry.rsrpCount += 1;
      if (rsrp >= -100) entry.rsrpGood += 1;
    }

    buckets.set(start, entry);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.ts - b.ts)
    .map((entry) => ({
      timestamp: new Date(entry.ts).toISOString(),
      mean_rsrp: entry.rsrpCount > 0 ? entry.rsrpSum / entry.rsrpCount : null,
      coverage_quality_percent: entry.rsrpCount > 0 ? (entry.rsrpGood / entry.rsrpCount) * 100 : null,
    }));
}

function mergeMultiTrends(trendMap, field) {
  const map = new Map();
  for (const [op, trend] of trendMap) {
    for (const entry of trend) {
      const existing = map.get(entry.timestamp) || { timestamp: entry.timestamp };
      existing[op] = entry[field];
      map.set(entry.timestamp, existing);
    }
  }
  return Array.from(map.values()).sort((x, y) => new Date(x.timestamp) - new Date(y.timestamp));
}

function OperatorComparisonPage({ activePage, onNavigate, apiMode, onApiModeChange }) {
  const {
    regions,
    operators,
    networkTypes,
    selectedRegion,
    setSelectedRegion,
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
  } = useDeviceData(apiMode);

  const [selectedOperators, setSelectedOperators] = useState([]);

  const operatorOptions = operators.filter((op) => op.id !== "all");

  const scopedRows = useMemo(() => {
    if (!selectedRegion || selectedRegion === ALL_REGIONS_ID) return heatmapPoints;
    return heatmapPoints.filter((row) => getRegionLabel(row) === selectedRegion);
  }, [heatmapPoints, selectedRegion]);

  const activeOperators = useMemo(() => {
    if (selectedOperators.length > 0) return selectedOperators;
    return operatorOptions.slice(0, 2).map((op) => op.id);
  }, [selectedOperators, operatorOptions]);

  function toggleOperator(opId) {
    setSelectedOperators((prev) =>
      prev.includes(opId) ? prev.filter((id) => id !== opId) : [...prev, opId]
    );
  }

  const operatorMetrics = useMemo(() => {
    return activeOperators.map((opId) => {
      const rows = scopedRows.filter((row) => row.operator === opId);
      const rsrp = rows.map((r) => toFiniteNumber(r.rsrp)).filter((v) => v != null);
      const rsrq = rows.map((r) => toFiniteNumber(r.rsrq)).filter((v) => v != null);
      const goodCoverage = rsrp.length
        ? (rsrp.filter((v) => v >= -100).length / rsrp.length) * 100
        : null;
      return {
        operator: opId,
        samples: rows.length,
        avgRsrp: rsrp.length ? average(rsrp) : null,
        avgRsrq: rsrq.length ? average(rsrq) : null,
        coveragePct: goodCoverage,
      };
    });
  }, [activeOperators, scopedRows]);

  const operatorTrends = useMemo(() => {
    const map = new Map();
    for (const opId of activeOperators) {
      const rows = scopedRows.filter((row) => row.operator === opId);
      map.set(opId, aggregateOperatorTrend(rows, selectedPeriod));
    }
    return map;
  }, [activeOperators, scopedRows, selectedPeriod]);

  const rsrpTrend = useMemo(() => mergeMultiTrends(operatorTrends, "mean_rsrp"), [operatorTrends]);
  const coverageTrend = useMemo(() => mergeMultiTrends(operatorTrends, "coverage_quality_percent"), [operatorTrends]);

  function average(values) {
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  return (
    <div className="page">
      <Header
        activePage={activePage}
        onNavigate={onNavigate}
        onRefresh={refresh}
        loading={loading}
        regions={regions}
        selectedRegion={selectedRegion}
        onRegionChange={setSelectedRegion}
        apiMode={apiMode}
        onApiModeChange={onApiModeChange}
      />

      <main className="page-content">
        <section className="page-intro">
          <span className="page-tag">Comparison</span>
          <h2>Operator Comparison</h2>
          <p>Compare signal metrics side-by-side across different mobile operators.</p>
        </section>

        <section className="map-filters" style={{ marginBottom: 16 }}>
          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Network type</span>
            <select className="header-device-select" value={selectedNetworkType} onChange={(e) => setSelectedNetworkType(e.target.value)}>
              {networkTypes.map((nt) => (
                <option key={nt.id} value={nt.id}>{nt.label}</option>
              ))}
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Period</span>
            <select className="header-device-select" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
              <option value="24h">Last 24h</option>
              <option value="week">Last week</option>
              <option value="month">Last month</option>
              <option value="all">All history</option>
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Data source</span>
            <select className="header-device-select" value={dataSourceMode} onChange={(e) => setDataSourceMode(e.target.value)}>
              <option value="crowdsourced">Crowdsourced only</option>
              <option value="predicted">ML model (predicted)</option>
              <option value="both">Both</option>
            </select>
          </div>

          {(dataSourceMode === "predicted" || dataSourceMode === "both") && (
            <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Min prediction confidence</span>
              <select className="header-device-select" value={String(predictionConfidenceMin)} onChange={(e) => setPredictionConfidenceMin(Number(e.target.value))}>
                <option value="0">Any</option>
                <option value="0.5">50%+</option>
                <option value="0.7">70%+</option>
                <option value="0.85">85%+</option>
              </select>
            </div>
          )}
        </section>

        <section className="operator-selector" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {operatorOptions.map((op, i) => {
            const active = activeOperators.includes(op.id);
            return (
              <button
                key={op.id}
                onClick={() => toggleOperator(op.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: active ? `2px solid ${OPERATOR_COLORS[i % OPERATOR_COLORS.length]}` : "1px solid #e2e8f0",
                  background: active ? "#f8fafc" : "#fff",
                  color: active ? OPERATOR_COLORS[i % OPERATOR_COLORS.length] : "#64748b",
                  fontWeight: active ? 600 : 400,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {op.label}
              </button>
            );
          })}
        </section>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={refresh}>Retry</button>
          </div>
        )}

        {operatorMetrics.length > 0 && (
          <section className="comparison-table-wrap" style={{ marginBottom: 24 }}>
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Samples</th>
                  <th>Avg RSRP</th>
                  <th>Avg RSRQ</th>
                  <th>Coverage %</th>
                </tr>
              </thead>
              <tbody>
                {operatorMetrics.map((m, i) => (
                  <tr key={m.operator}>
                    <td style={{ fontWeight: 600, color: OPERATOR_COLORS[i % OPERATOR_COLORS.length] }}>{m.operator}</td>
                    <td>{m.samples}</td>
                    <td>{formatNumber(m.avgRsrp)} dBm</td>
                    <td>{formatNumber(m.avgRsrq)} dB</td>
                    <td>{formatNumber(m.coveragePct, 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {operatorMetrics.length > 0 && (
          <section className="chart-card" style={{ marginBottom: 16 }}>
            <h3 className="chart-card-title">Avg RSRP by Operator</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={operatorMetrics} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="operator" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `${formatNumber(value, 1)} dBm`} />
                <Bar dataKey="avgRsrp" name="Avg RSRP">
                  {operatorMetrics.map((entry, i) => (
                    <rect key={entry.operator} fill={OPERATOR_COLORS[i % OPERATOR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>
        )}

        {activeOperators.length >= 2 && (
          <>
            <section className="reports-section-head">
              <h3>RSRP Trend Comparison</h3>
              <p>Mean RSRP over time, overlaid per operator.</p>
            </section>

            <section className="reports-three-col">
              <div className="chart-card">
                <h3 className="chart-card-title">Mean RSRP Trend</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={rsrpTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} />
                    <Legend />
                    {activeOperators.map((opId, i) => (
                      <Line key={opId} type="monotone" dataKey={opId} stroke={OPERATOR_COLORS[i % OPERATOR_COLORS.length]} dot={false} name={opId} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-card">
                <h3 className="chart-card-title">Coverage Quality % Trend</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={coverageTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} formatter={(v) => `${formatNumber(v, 1)}%`} />
                    <Legend />
                    {activeOperators.map((opId, i) => (
                      <Line key={opId} type="monotone" dataKey={opId} stroke={OPERATOR_COLORS[i % OPERATOR_COLORS.length]} dot={false} name={opId} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default OperatorComparisonPage;
