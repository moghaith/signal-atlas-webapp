import { useEffect, useMemo, useState } from "react";
import Header from "../components/Header/Header";
import useDeviceData from "../hooks/useDeviceData";
import { getAiDashboardSummary } from "../data/dataService";
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

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatNumber(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function computeMetrics(rows) {
  const rsrp = rows.map((row) => toFiniteNumber(row.rsrp)).filter((value) => value != null);
  const rsrq = rows.map((row) => toFiniteNumber(row.rsrq)).filter((value) => value != null);

  const goodCoverage = rsrp.length
    ? (rsrp.filter((value) => value >= -100).length / rsrp.length) * 100
    : null;

  const uniqueCoords = new Set(
    rows
      .filter((row) => row?.latitude != null && row?.longitude != null)
      .map((row) => `${Number(row.latitude).toFixed(6)},${Number(row.longitude).toFixed(6)}`)
  ).size;

  return {
    samples: rows.length,
    uniqueCoords,
    avgRsrp: average(rsrp),
    avgRsrq: average(rsrq),
    coveragePct: goodCoverage,
  };
}

function buildOperatorBreakdown(crowdsourcedRows, predictedRows) {
  const byOperator = new Map();

  const ensure = (operator) => {
    if (!byOperator.has(operator)) {
      byOperator.set(operator, { operator, crowd: [], pred: [] });
    }
    return byOperator.get(operator);
  };

  for (const row of crowdsourcedRows) {
    const operator = String(row?.operator || "Unknown operator").trim() || "Unknown operator";
    ensure(operator).crowd.push(row);
  }

  for (const row of predictedRows) {
    const operator = String(row?.operator || "Unknown operator").trim() || "Unknown operator";
    ensure(operator).pred.push(row);
  }

  return Array.from(byOperator.values())
    .map((group) => {
      const crowdMetrics = computeMetrics(group.crowd);
      const predMetrics = computeMetrics(group.pred);
      return {
        operator: group.operator,
        crowd: crowdMetrics,
        pred: predMetrics,
        deltaRsrp: crowdMetrics.avgRsrp == null || predMetrics.avgRsrp == null
          ? null
          : predMetrics.avgRsrp - crowdMetrics.avgRsrp,
        deltaCoverage: crowdMetrics.coveragePct == null || predMetrics.coveragePct == null
          ? null
          : predMetrics.coveragePct - crowdMetrics.coveragePct,
      };
    })
    .sort((a, b) => (b.crowd.samples + b.pred.samples) - (a.crowd.samples + a.pred.samples));
}

function buildFallbackSummary({
  selectedRegion,
  selectedPeriod,
  crowdsourcedMetrics,
  predictedMetrics,
  avgRsrpDelta,
  coverageDelta,
  operatorBreakdown,
}) {
  const regionLabel = !selectedRegion || selectedRegion === ALL_REGIONS_ID
    ? "All regions"
    : selectedRegion;
  const topOperator = operatorBreakdown[0]?.operator || "N/A";
  const sampleGap = (predictedMetrics.samples || 0) - (crowdsourcedMetrics.samples || 0);

  return `For ${regionLabel} over ${selectedPeriod}, predicted data differs from crowdsourced data by ${sampleGap} samples, with ${topOperator} contributing the highest volume. The average RSRP delta (predicted minus crowdsourced) is ${formatNumber(avgRsrpDelta, 2)} dBm and the coverage quality delta is ${formatNumber(coverageDelta, 1)}%. This suggests meaningful model-to-measurement deviation in parts of the region. Prioritize additional real measurements in low-confidence zones, then investigate operators with negative RSRP deltas for optimization opportunities.`;
}

function ComparisonPage({ activePage, onNavigate, apiMode, onApiModeChange }) {
  const {
    regions,
    operators,
    networkTypes,
    selectedRegion,
    setSelectedRegion,
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
  } = useDeviceData(apiMode);

  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    if (dataSourceMode !== "both") {
      setDataSourceMode("both");
    }
  }, [dataSourceMode, setDataSourceMode]);

  useEffect(() => {
    if (selectedOperator !== "all") {
      setSelectedOperator("all");
    }
  }, [selectedOperator, setSelectedOperator]);

  const scopedRows = useMemo(() => {
    if (!selectedRegion || selectedRegion === ALL_REGIONS_ID) {
      return heatmapPoints;
    }
    return heatmapPoints.filter((row) => getRegionLabel(row) === selectedRegion);
  }, [heatmapPoints, selectedRegion]);

  const crowdsourcedRows = useMemo(
    () => scopedRows.filter((row) => !row.is_prediction),
    [scopedRows]
  );

  const predictedRows = useMemo(
    () => scopedRows.filter((row) => row.is_prediction),
    [scopedRows]
  );

  const crowdsourcedMetrics = useMemo(() => computeMetrics(crowdsourcedRows), [crowdsourcedRows]);
  const predictedMetrics = useMemo(() => computeMetrics(predictedRows), [predictedRows]);

  const avgRsrpDelta = useMemo(() => {
    if (crowdsourcedMetrics.avgRsrp == null || predictedMetrics.avgRsrp == null) return null;
    return predictedMetrics.avgRsrp - crowdsourcedMetrics.avgRsrp;
  }, [crowdsourcedMetrics.avgRsrp, predictedMetrics.avgRsrp]);

  const avgRsrqDelta = useMemo(() => {
    if (crowdsourcedMetrics.avgRsrq == null || predictedMetrics.avgRsrq == null) return null;
    return predictedMetrics.avgRsrq - crowdsourcedMetrics.avgRsrq;
  }, [crowdsourcedMetrics.avgRsrq, predictedMetrics.avgRsrq]);

  const coverageDelta = useMemo(() => {
    if (crowdsourcedMetrics.coveragePct == null || predictedMetrics.coveragePct == null) return null;
    return predictedMetrics.coveragePct - crowdsourcedMetrics.coveragePct;
  }, [crowdsourcedMetrics.coveragePct, predictedMetrics.coveragePct]);

  const operatorBreakdown = useMemo(
    () => buildOperatorBreakdown(crowdsourcedRows, predictedRows),
    [crowdsourcedRows, predictedRows]
  );

  const handleGenerateAiSummary = async () => {
    setAiLoading(true);
    setAiError("");

    const payload = {
      region: selectedRegion,
      period: selectedPeriod,
      crowdsourced: crowdsourcedMetrics,
      predicted: predictedMetrics,
      deltas: {
        avg_rsrp: avgRsrpDelta,
        avg_rsrq: avgRsrqDelta,
        coverage: coverageDelta,
      },
      operators: operatorBreakdown.slice(0, 8),
    };

    try {
      const summary = await getAiDashboardSummary(payload);
      setAiSummary(summary);
    } catch (error) {
      const reason = error?.message ? ` (${error.message})` : "";
      setAiError(`AI summary unavailable. Showing rule-based summary.${reason}`);
      setAiSummary(buildFallbackSummary({
        selectedRegion,
        selectedPeriod,
        crowdsourcedMetrics,
        predictedMetrics,
        avgRsrpDelta,
        coverageDelta,
        operatorBreakdown,
      }));
    } finally {
      setAiLoading(false);
    }
  };

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
          <span className="page-tag">Page 02</span>
          <h2>Comparison</h2>
          <p>
            Compare crowdsourced measurements against ML predictions for the currently selected region,
            operator, period, and confidence threshold.
          </p>
        </section>

        <section className="comparison-filters">
          <div className="comparison-filter">
            <span>Operator</span>
            <select
              className="header-device-select"
              value="all"
              disabled
            >
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>{operator.label}</option>
              ))}
            </select>
          </div>

          <div className="comparison-filter">
            <span>Period</span>
            <select
              className="header-device-select"
              value={selectedPeriod}
              onChange={(event) => setSelectedPeriod(event.target.value)}
            >
              <option value="24h">Last 24h</option>
              <option value="week">Last week</option>
              <option value="month">Last month</option>
              <option value="all">All history</option>
            </select>
          </div>

          <div className="comparison-filter">
            <span>Network type</span>
            <select
              className="header-device-select"
              value={selectedNetworkType}
              onChange={(event) => setSelectedNetworkType(event.target.value)}
            >
              {networkTypes.map((networkType) => (
                <option key={networkType.id} value={networkType.id}>{networkType.label}</option>
              ))}
            </select>
          </div>

          <div className="comparison-filter">
            <span>Data source</span>
            <select className="header-device-select" value="both" disabled>
              <option value="both">Both (Crowdsourced + Predicted)</option>
            </select>
          </div>

          <div className="comparison-filter">
            <span>Min prediction confidence</span>
            <select
              className="header-device-select"
              value={String(predictionConfidenceMin)}
              onChange={(event) => setPredictionConfidenceMin(Number(event.target.value))}
            >
              <option value="0">Any</option>
              <option value="0.5">50%+</option>
              <option value="0.7">70%+</option>
              <option value="0.85">85%+</option>
            </select>
          </div>
        </section>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={refresh}>Retry</button>
          </div>
        )}

        <section className="comparison-grid">
          <article className="comparison-panel crowdsourced">
            <h3>Crowdsourced</h3>
            <p>{crowdsourcedMetrics.samples} samples</p>
          </article>
          <article className="comparison-panel predicted">
            <h3>Predicted</h3>
            <p>{predictedMetrics.samples} samples</p>
          </article>
          <article className="comparison-panel delta">
            <h3>Delta (Pred - Crowd)</h3>
            <p>{formatNumber(avgRsrpDelta, 2)} dBm (RSRP)</p>
          </article>
        </section>

        <section className="comparison-ai-panel">
          <div className="comparison-ai-head">
            <h3>AI Analytics Summary</h3>
            <button type="button" onClick={handleGenerateAiSummary} disabled={aiLoading}>
              {aiLoading ? "Generating..." : "Generate AI Summary"}
            </button>
          </div>
          {aiError && <p className="comparison-ai-error">{aiError}</p>}
          {aiSummary ? (
            <p className="comparison-ai-text">{aiSummary}</p>
          ) : (
            <p className="comparison-ai-placeholder">Generate a concise AI interpretation of the current comparison metrics.</p>
          )}
        </section>

        <section className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Crowdsourced</th>
                <th>Predicted</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total samples</td>
                <td>{crowdsourcedMetrics.samples}</td>
                <td>{predictedMetrics.samples}</td>
                <td>{predictedMetrics.samples - crowdsourcedMetrics.samples}</td>
              </tr>
              <tr>
                <td>Unique coordinates</td>
                <td>{crowdsourcedMetrics.uniqueCoords}</td>
                <td>{predictedMetrics.uniqueCoords}</td>
                <td>{predictedMetrics.uniqueCoords - crowdsourcedMetrics.uniqueCoords}</td>
              </tr>
              <tr>
                <td>Average RSRP</td>
                <td>{formatNumber(crowdsourcedMetrics.avgRsrp, 2)} dBm</td>
                <td>{formatNumber(predictedMetrics.avgRsrp, 2)} dBm</td>
                <td>{formatNumber(avgRsrpDelta, 2)} dBm</td>
              </tr>
              <tr>
                <td>Average RSRQ</td>
                <td>{formatNumber(crowdsourcedMetrics.avgRsrq, 2)} dB</td>
                <td>{formatNumber(predictedMetrics.avgRsrq, 2)} dB</td>
                <td>{formatNumber(avgRsrqDelta, 2)} dB</td>
              </tr>
              <tr>
                <td>Coverage (RSRP &gt;= -100)</td>
                <td>{formatNumber(crowdsourcedMetrics.coveragePct, 1)}%</td>
                <td>{formatNumber(predictedMetrics.coveragePct, 1)}%</td>
                <td>{formatNumber(coverageDelta, 1)}%</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="comparison-operator-section">
          <div className="comparison-section-head">
            <h3>Operator vs Operator</h3>
            <p>Side-by-side comparison of each operator across crowdsourced and predicted samples.</p>
          </div>
          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Crowd samples</th>
                  <th>Pred samples</th>
                  <th>Crowd avg RSRP</th>
                  <th>Pred avg RSRP</th>
                  <th>Delta RSRP</th>
                  <th>Crowd coverage</th>
                  <th>Pred coverage</th>
                  <th>Delta coverage</th>
                </tr>
              </thead>
              <tbody>
                {operatorBreakdown.map((row) => (
                  <tr key={row.operator}>
                    <td>{row.operator}</td>
                    <td>{row.crowd.samples}</td>
                    <td>{row.pred.samples}</td>
                    <td>{formatNumber(row.crowd.avgRsrp, 2)} dBm</td>
                    <td>{formatNumber(row.pred.avgRsrp, 2)} dBm</td>
                    <td>{formatNumber(row.deltaRsrp, 2)} dBm</td>
                    <td>{formatNumber(row.crowd.coveragePct, 1)}%</td>
                    <td>{formatNumber(row.pred.coveragePct, 1)}%</td>
                    <td>{formatNumber(row.deltaCoverage, 1)}%</td>
                  </tr>
                ))}
                {operatorBreakdown.length === 0 && (
                  <tr>
                    <td colSpan={9}>No operator data available for this selection.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default ComparisonPage;
