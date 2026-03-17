import { useState } from "react";
import OverviewPage from "./pages/OverviewPage";
import MapPage from "./pages/MapPage";
import Header from "./components/Header/Header";
import Mockup from "./Mockup";

function PlaceholderPage({ pageKey, onNavigate, apiMode, onApiModeChange }) {
  const title = pageKey === "detail" ? "Device Detail" : "Historical Reports";
  const subtitle = pageKey === "detail"
    ? "This page is next in progress. Layout and navigation are ready."
    : "This page is next in progress. Export and reporting widgets are coming next.";

  return (
    <div className="page">
      <Header activePage={pageKey} onNavigate={onNavigate} onRefresh={() => {}} loading={false} apiMode={apiMode} onApiModeChange={onApiModeChange} />
      <main className="page-content">
        <section className="empty-state">
          <span className="empty-icon">🧩</span>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </section>
      </main>
    </div>
  );
}

function App() {
  const [showMockup, setShowMockup] = useState(false);
  const [activePage, setActivePage] = useState("overview");
  const [apiMode, setApiMode] = useState(import.meta.env.VITE_API_MODE || "supabase");

  const renderLivePage = () => {
    if (activePage === "map") {
      return <MapPage activePage={activePage} onNavigate={setActivePage} apiMode={apiMode} onApiModeChange={setApiMode} />;
    }
    if (activePage === "detail" || activePage === "reports") {
      return <PlaceholderPage pageKey={activePage} onNavigate={setActivePage} apiMode={apiMode} onApiModeChange={setApiMode} />;
    }
    return <OverviewPage activePage={activePage} onNavigate={setActivePage} apiMode={apiMode} onApiModeChange={setApiMode} />;
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
      {showMockup ? <Mockup /> : renderLivePage()}
    </>
  );
}

export default App;