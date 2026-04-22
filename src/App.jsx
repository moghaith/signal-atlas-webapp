import { Suspense, lazy, useState } from "react";
import Mockup from "./Mockup";

const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const MapPage = lazy(() => import("./pages/MapPage"));
const ComparisonPage = lazy(() => import("./pages/ComparisonPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));

function App() {
  const [showMockup, setShowMockup] = useState(false);
  const [activePage, setActivePage] = useState("overview");
  const apiMode = "supabase";

  const renderLivePage = () => {
    if (activePage === "detail") {
      return <ComparisonPage activePage={activePage} onNavigate={setActivePage} apiMode={apiMode} onApiModeChange={() => {}} />;
    }
    if (activePage === "map") {
      return <MapPage activePage={activePage} onNavigate={setActivePage} apiMode={apiMode} onApiModeChange={() => {}} />;
    }
    if (activePage === "reports") {
      return <ReportsPage activePage={activePage} onNavigate={setActivePage} apiMode={apiMode} onApiModeChange={() => {}} />;
    }
    return <OverviewPage activePage={activePage} onNavigate={setActivePage} apiMode={apiMode} onApiModeChange={() => {}} />;
  };

  return (
    <>
      <button
        onClick={() => setShowMockup(!showMockup)}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 9999,
          padding: "8px 16px",
          borderRadius: 8,
          border: "none",
          background: showMockup ? "#6b9ae8" : "#7c6fcd",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        }}
      >
        {showMockup ? "← Live App" : "View Mockup →"}
      </button>
      {showMockup ? (
        <Mockup />
      ) : (
        <Suspense
          fallback={(
            <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#475569", fontSize: 14 }}>
              Loading dashboard...
            </div>
          )}
        >
          {renderLivePage()}
        </Suspense>
      )}
    </>
  );
}

export default App;