import Header from "../components/Header/Header";
import StatCard from "../components/StatCard/StatCard";
import DeviceInfo from "../components/DeviceInfo/DeviceInfo";
import {
  MeanRsrpTrendChart,
  MeanRsrqTrendChart,
  CoverageQualityTrendChart,
} from "../components/charts/SignalCharts";
import "../components/charts/SignalCharts.css";
import useDeviceData from "../hooks/useDeviceData";
import "./OverviewPage.css";

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
          <span className="page-tag">Page 01</span>
          <h2>Home / Overview</h2>
          <p>
            Landing page showing a high-level summary of the selected region. Stat cards for key metrics,
            area info panel, and time-series charts.
          </p>
        </section>

        <section className="map-filters" style={{ marginBottom: 16 }}>
          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Operator</span>
            <select
              className="header-device-select"
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
            >
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>{operator.label}</option>
              ))}
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Period</span>
            <select
              className="header-device-select"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <option value="24h">Last 24h</option>
              <option value="week">Last week</option>
              <option value="month">Last month</option>
              <option value="all">All history</option>
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Network type</span>
            <select
              className="header-device-select"
              value={selectedNetworkType}
              onChange={(e) => setSelectedNetworkType(e.target.value)}
            >
              {networkTypes.map((networkType) => (
                <option key={networkType.id} value={networkType.id}>{networkType.label}</option>
              ))}
            </select>
          </div>

          <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Data source</span>
            <select
              className="header-device-select"
              value={dataSourceMode}
              onChange={(e) => setDataSourceMode(e.target.value)}
            >
              <option value="crowdsourced">Crowdsourced only</option>
              <option value="predicted">ML model (predicted)</option>
              <option value="both">Both</option>
            </select>
          </div>

          {(dataSourceMode === "predicted" || dataSourceMode === "both") && (
            <div className="map-toggle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Min prediction confidence</span>
              <select
                className="header-device-select"
                value={String(predictionConfidenceMin)}
                onChange={(e) => setPredictionConfidenceMin(Number(e.target.value))}
              >
                <option value="0">Any</option>
                <option value="0.5">50%+</option>
                <option value="0.7">70%+</option>
                <option value="0.85">85%+</option>
              </select>
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
              <DeviceInfo reading={latestReading} />
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
