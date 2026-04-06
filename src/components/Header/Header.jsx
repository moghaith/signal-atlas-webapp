import "./Header.css";
import logo from "../../assets/logo_transparent_with_border.png";

function Header({
  activePage,
  onNavigate,
  onRefresh,
  loading,
  regions = [],
  selectedRegion = "",
  onRegionChange,
  apiMode = "device",
  onApiModeChange,
}) {
  const tabs = [
    { id: "overview", tag: "Page 01", label: "Home / Overview" },
    { id: "detail", tag: "Page 02", label: "Device Detail" },
    { id: "map", tag: "Page 03", label: "Map View" },
    { id: "reports", tag: "Page 04", label: "Historical Reports" },
  ];

  return (
    <header className="header-shell">
      <div className="header-top-row">
        <div className="header-logo">
          <img src={logo} alt="Signal Atlas" className="logo-img" />
          <span className="logo-text">Signal Atlas</span>
        </div>
        <div className="header-badge">4 Pages · REST API Design</div>
      </div>

      <div className="header-bottom-row">
        <nav className="header-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`nav-link ${activePage === tab.id ? "active" : ""}`}
              onClick={() => onNavigate?.(tab.id)}
            >
              <span className="nav-tag">{tab.tag}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="header-right">
          <div className="header-device-wrap">
            <span className="header-device-label">API</span>
            <select
              className="header-device-select"
              value={apiMode}
              onChange={(e) => onApiModeChange?.(e.target.value)}
            >
              <option value="supabase">Supabase</option>
              <option value="device">Device API</option>
              <option value="mobile">Mobile API</option>
            </select>
          </div>

          <div className="header-device-wrap">
            <span className="header-device-label">Region</span>
            <select
              className="header-device-select"
              value={selectedRegion}
              onChange={(e) => onRegionChange?.(e.target.value)}
              disabled={!regions.length}
            >
              {!regions.length && <option value="">No regions</option>}
              {regions.map((region) => (
                <option key={region.id || region.label} value={region.id || region.label}>
                  {region.label}
                </option>
              ))}
            </select>
          </div>

          <button
            className={`refresh-btn ${loading ? "spinning" : ""}`}
            onClick={onRefresh}
            disabled={loading}
            title="Refresh data"
          >
            ↻
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
