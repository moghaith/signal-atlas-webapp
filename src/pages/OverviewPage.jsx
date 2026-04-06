import Header from "../components/Header/Header";
import StatCard from "../components/StatCard/StatCard";
import DeviceInfo from "../components/DeviceInfo/DeviceInfo";
import { SignalLevelChart, DualSignalChart, RSRQChart } from "../components/charts/SignalCharts";
import "../components/charts/SignalCharts.css";
import useDeviceData from "../hooks/useDeviceData";
import "./OverviewPage.css";

function OverviewPage({ activePage, onNavigate, apiMode, onApiModeChange }) {
  const {
    regions,
    selectedRegion,
    setSelectedRegion,
    selectedRegionInfo,
    latestReading,
    readings,
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

            <section className="two-col-grid">
              <DeviceInfo reading={latestReading} />
              <SignalLevelChart data={readings} />
            </section>

            <section className="two-col-grid">
              <DualSignalChart data={readings} />
              <RSRQChart data={readings} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default OverviewPage;
