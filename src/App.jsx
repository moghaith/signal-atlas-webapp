import { Suspense, lazy, useState } from "react";
import Mockup from "./Mockup";
import Header from "./components/Header/Header";
import useDeviceData from "./hooks/useDeviceData";
import './App.css'// index.js

const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const MapPage = lazy(() => import("./pages/MapPage"));
const ComparisonPage = lazy(() => import("./pages/ComparisonPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const CoverageRequestPage = lazy(() => import("./pages/CoverageRequestPage"));

function AppShell() {
  const [activePage, setActivePage] = useState("overview");
  const apiMode = "supabase";

  const deviceData = useDeviceData(apiMode);
  const {
    countries,
    cities,
    selectedCountry,
    setSelectedCountry,
    selectedCity,
    setSelectedCity,

    // legacy
    regions,
    selectedRegion,
    setSelectedRegion,

    loading,
    refresh,
  } = deviceData;

  return (
    <div className="page">
      <Header
        activePage={activePage}
        onNavigate={setActivePage}
        onRefresh={refresh}
        loading={loading}

        countries={countries}
        cities={cities}
        selectedCountry={selectedCountry}
        selectedCity={selectedCity}
        onCountryChange={setSelectedCountry}
        onCityChange={setSelectedCity}

        // optional legacy props
        regions={regions}
        selectedRegion={selectedRegion}
        onRegionChange={setSelectedRegion}

        apiMode={apiMode}
        onApiModeChange={() => {}}
      />

      <Suspense
        fallback={
          <div style={{ minHeight: "60vh", display: "grid", placeItems: "center",
                        color: "var(--color-text-secondary)", fontSize: 14 }}>
            Loading...
          </div>
        }
      >
        <PageContent activePage={activePage} deviceData={deviceData} apiMode={apiMode} />
      </Suspense>
    </div>
  );
}

function PageContent({ activePage, deviceData, apiMode }) {
  const sharedProps = { deviceData, apiMode };

  switch (activePage) {
    case "detail":  return <ComparisonPage {...sharedProps} />;
    case "map":     return <MapPage        {...sharedProps} />;
    case "reports": return <ReportsPage    {...sharedProps} />;
    case "coverage": return <CoverageRequestPage {...sharedProps} />;
    default:        return <OverviewPage   {...sharedProps} />;
  }
}

function App() {
  const [showMockup, setShowMockup] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowMockup(!showMockup)}
        style={{
          position: "fixed", bottom: 16, right: 16, zIndex: 9999,
          padding: "8px 16px", borderRadius: 8, border: "none",
          background: showMockup ? "#6b9ae8" : "#7c6fcd",
          color: "#fff", fontSize: 13, fontWeight: 600,
          cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        }}
      >
        {showMockup ? "← Live App" : "View Mockup →"}
      </button>
      {showMockup ? <Mockup /> : <AppShell />}
    </>
  );
}

export default App;