import { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { selectStyles } from "../styles/selectStyles";
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
  if (value == null || !Number.isFinite(value)) return "--";
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

function PredictionInsightsPage({ activePage, onNavigate, apiMode, onApiModeChange }) {
  const {
    regions,
    operators,
    networkTypes,
    selectedRegion,
    setSelectedRegion,
    setSelectedOperator,
    selectedNetworkType,
    setSelectedNetworkType,
    selectedPeriod,
    setSelectedPeriod,
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
    setDataSourceMode("both");
    setSelectedOperator("all");
  }, [setDataSourceMode, setSelectedOperator]);

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
          <h2>Prediction Insights</h2>
          <p>
            Analyze differences between measured and predicted network performance to
            uncover trends, validate model outputs, and identify regions that may
            benefit from additional data collection.
          </p>
        </section>

        <section className="map-filters">

          {/* Operator */}
          <div className="map-toggle">
            <span>Operator</span>
            <Select
              value={operators
                .map((o) => ({ value: o.id, label: o.label }))
                .find((o) => o.value === selectedOperator)}
              onChange={(opt) => setSelectedOperator(opt?.value)}
              options={operators.map((o) => ({
                value: o.id,
                label: o.label,
              }))}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          {/* Period */}
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

          {/* Network type */}
          <div className="map-toggle">
            <span>Network type</span>
            <Select
              value={networkTypes
                .map((n) => ({ value: n.id, label: n.label }))
                .find((o) => o.value === selectedNetworkType)}
              onChange={(opt) => setSelectedNetworkType(opt?.value)}
              options={networkTypes.map((n) => ({
                value: n.id,
                label: n.label,
              }))}
              isSearchable={false}
              styles={selectStyles}
            />
          </div>

          {/* Data source (disabled but same UI style) */}
          <div className="map-toggle">
            <span>Data source</span>
            <Select
              value={{ value: "both", label: "Both (Crowdsourced + Predicted)" }}
              isDisabled
              styles={selectStyles}
              options={[
                { value: "both", label: "Both (Crowdsourced + Predicted)" }
              ]}
            />
          </div>

          {/* Conditional */}
          {(dataSourceMode === "predicted" || dataSourceMode === "both") && (
            <div className="map-toggle">
              <span>Min prediction confidence</span>
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
              <td><span className="values">{crowdsourcedMetrics.samples}</span></td>
              <td><span className="values">{predictedMetrics.samples}</span></td>
              <td><span className="values">{predictedMetrics.samples - crowdsourcedMetrics.samples}</span></td>
            </tr>

            <tr>
              <td>Unique coordinates</td>
              <td><span className="values">{crowdsourcedMetrics.uniqueCoords}</span></td>
              <td><span className="values">{predictedMetrics.uniqueCoords}</span></td>
              <td><span className="values">{predictedMetrics.uniqueCoords - crowdsourcedMetrics.uniqueCoords}</span></td>
            </tr>

            <tr>
              <td>Average RSRP</td>
              <td>
                <span className="values">{formatNumber(crowdsourcedMetrics.avgRsrp, 2)}</span>
                <span className="units"> dBm</span>
              </td>
              <td>
                <span className="values">{formatNumber(predictedMetrics.avgRsrp, 2)}</span>
                <span className="units"> dBm</span>
              </td>
              <td>
                <span className="values">{formatNumber(avgRsrpDelta, 2)}</span>
                <span className="units"> dBm</span>
              </td>
            </tr>

            <tr>
              <td>Average RSRQ</td>
              <td>
                <span className="values">{formatNumber(crowdsourcedMetrics.avgRsrq, 2)}</span>
                <span className="units"> dB</span>
              </td>
              <td>
                <span className="values">{formatNumber(predictedMetrics.avgRsrq, 2)}</span>
                <span className="units"> dB</span>
              </td>
              <td>
                <span className="values">{formatNumber(avgRsrqDelta, 2)}</span>
                <span className="units"> dB</span>
              </td>
            </tr>

            <tr>
              <td>Coverage (RSRP &gt;= -100)</td>
              <td>
                <span className="values">{formatNumber(crowdsourcedMetrics.coveragePct, 1)}</span>
                <span className="units"> %</span>
              </td>
              <td>
                <span className="values">{formatNumber(predictedMetrics.coveragePct, 1)}</span>
                <span className="units"> %</span>
              </td>
              <td>
                <span className="values">{formatNumber(coverageDelta, 1)}</span>
                <span className="units"> %</span>
              </td>
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
                    <td>
                      <span className="values">
                        {row.operator}
                      </span>
                    </td>
                    <td>
                      <span className="values">
                        {row.crowd.samples}
                      </span>
                    </td>
                    <td>
                      <span className="values">
                        {row.pred.samples}
                      </span>
                      </td>
                    <td>
                      <span className="values">
                        {formatNumber(row.crowd.avgRsrp, 2)}
                      </span>
                      <span className="units"> dBm</span>
                    </td>
                    <td>
                      <span className="values">
                        {formatNumber(row.pred.avgRsrp, 2)} 
                      </span>
                      <span className="units"> dBm</span>
                      
                    </td>
                    <td>
                      <span className="values">
                        {formatNumber(row.deltaRsrp, 2)} 
                      </span>
                      <span className="units"> dBm</span>
                    </td>
                    <td>
                      <span className="values">
                        {formatNumber(row.crowd.coveragePct, 1)}
                      </span>
                      <span className="units">%</span>
                    </td>
                    <td>
                      <span className="values">
                        {formatNumber(row.pred.coveragePct, 1)}
                      </span>
                      <span className="units"> %</span>
                    </td>
                    <td>
                      <span className="values">
                        {formatNumber(row.deltaCoverage, 1)}
                      </span>
                      <span className="units"> %</span>
                    </td>
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

export default PredictionInsightsPage;
