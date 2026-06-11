import Select from "react-select";
import { selectStyles } from "../styles/selectStyles";
import Header from "../components/Header/Header";
import StatCard from "../components/StatCard/StatCard";
import PredictionInsights from "../components/PredicitonInsightsCard/PredictionInsightsCard";
import {
  MeanRsrpTrendChart,
  MeanRsrqTrendChart,
  CoverageQualityTrendChart,
} from "../components/charts/SignalCharts";
import "../components/charts/SignalCharts.css";
import useDeviceData from "../hooks/useDeviceData";
import "./OverviewPage.css";
import "../styles/global.css";

function OverviewPage({ activePage, onNavigate, apiMode, onApiModeChange }) {
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
    selectedRegionInfo,
    latestReading,
    predictionPoints,
    readings,
    trendPoints,
    trendAggregationLabel,
    overviewMetrics,
    loading,
    error,
    readingsError,
    refresh,
  } = useDeviceData(apiMode);

  const r = latestReading;

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
          <h2>Overview</h2>
          <p>
            A high-level dashboard summarizing the selected region. Includes key performance metrics,
            regional context panels, and time-series visualizations to provide a quick operational snapshot.
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

          {/* Data source */}
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
                onChange={(opt) =>
                  setPredictionConfidenceMin(opt?.value)
                }
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

        {loading && !selectedRegionInfo && (
          <div className="loading-state">
            <div className="loading-spinner" />
            <span>Loading region data...</span>
          </div>
        )}

        {!loading && regions.length === 0 && !latestReading && readings.length === 0 && !error && (
          <div className="empty-state">
            <span className="empty-icon">📡</span>
            <h3>No Regions Found</h3>
            <p>No regional data is available from the backend yet.</p>
          </div>
        )}

        {readingsError && (
          <div className="error-banner readings-error">
            <span>⚠️ Could not fetch region readings: {readingsError}</span>
            <button onClick={refresh}>Retry</button>
          </div>
        )}

        {/* Signal data — only when readings are available */}
        {(latestReading || readings.length > 0) && (
          <>
            <section className="stat-cards-grid">
              <StatCard title="RSRP" value={r?.rsrp} unit="dBm" metric="rsrp" />
              <StatCard title="RSSI" value={r?.rssi} unit="dBm" metric="rssi" />
              <StatCard title="RSRQ" value={r?.rsrq} unit="dB" metric="rsrq" />
              <StatCard title="ASU" value={r?.asu} unit="" metric="asu" />
            </section>

            <section className="device-summary-cards">
              <div className="summary-card">
                <span className="summary-label">Coverage Quality</span>
                <span className="summary-value">{overviewMetrics.coverage_quality_percent != null ? `${overviewMetrics.coverage_quality_percent.toFixed(1)}%` : "-"}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Signal Quality Index</span>
                <span className="summary-value">{overviewMetrics.signal_quality_index != null ? overviewMetrics.signal_quality_index.toFixed(2) : "-"}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Devices Count</span>
                <span className="summary-value">{overviewMetrics.devices_count ?? 0}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Detected Cells</span>
                <span className="summary-value">{overviewMetrics.detected_cells_count ?? 0}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Measurement Density</span>
                <span className="summary-value">{overviewMetrics.measurements_density != null ? overviewMetrics.measurements_density.toFixed(2) : "-"}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Median RSRP</span>
                <span className="summary-value">{overviewMetrics.median_rsrp != null ? `${overviewMetrics.median_rsrp.toFixed(1)} dBm` : "-"}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Reliability Score</span>
                <span className="summary-value">{overviewMetrics.coverage_reliability_score != null ? overviewMetrics.coverage_reliability_score.toFixed(2) : "-"}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Total Readings</span>
                <span className="summary-value">{overviewMetrics.total_readings ?? 0}</span>
              </div>
            </section>

            <section className="two-col-grid">
              <PredictionInsights predictionPoints={predictionPoints} />
              <MeanRsrpTrendChart
                data={trendPoints}
                period={selectedPeriod}
                aggregationLabel={trendAggregationLabel}
              />
            </section>

            <section className="two-col-grid">
              <MeanRsrqTrendChart
                data={trendPoints}
                period={selectedPeriod}
                aggregationLabel={trendAggregationLabel}
              />
              <CoverageQualityTrendChart
                data={trendPoints}
                period={selectedPeriod}
                aggregationLabel={trendAggregationLabel}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default OverviewPage;
