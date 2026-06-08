import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import "./Header.css";
import logo from "../../assets/logo_transparent_with_border.png";

function Header({
  activePage: activePageProp,
  onNavigate,
  onRefresh,
  loading,
  regions = [],
  selectedRegion = "",
  onRegionChange,
  apiMode = "supabase",
  onApiModeChange,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const pathToTab = {
    "/": "overview",
    "/overview": "overview",
    "/comparison": "detail",
    "/map": "map",
    "/reports": "reports",
  };

  const activePage = activePageProp || pathToTab[location.pathname] || "overview";

  const tabs = [
    { id: "overview", path: "/overview", tag: "Page 01", label: "Home / Overview" },
    { id: "detail", path: "/comparison", tag: "Page 02", label: "Comparison" },
    { id: "map", path: "/map", tag: "Page 03", label: "Map View" },
    { id: "reports", path: "/reports", tag: "Page 04", label: "Historical Reports" },
  ];

  function handleNavigate(tabId) {
    if (onNavigate) {
      onNavigate(tabId);
    }
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) navigate(tab.path);
  }

  return (
    <header className="header-shell">
      <div className="header-top-row">
        <div className="header-logo">
          <img src={logo} alt="Signal Atlas" className="logo-img" />
          <Link to="/" className="logo-text" style={{ textDecoration: "none", color: "inherit" }}>Signal Atlas</Link>
        </div>
        <div className="header-badge">4 Pages · REST API Design</div>

        <div className="header-auth">
          {user ? (
            <div className="header-user-menu">
              <Link to="/profile" className="header-user-btn">
                <span className="header-user-avatar">
                  {profile?.display_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || "?"}
                </span>
                <span className="header-user-name">
                  {profile?.display_name || user.email?.split("@")[0] || "User"}
                </span>
              </Link>
              <button className="header-logout-btn" onClick={signOut} title="Sign out">
                Logout
              </button>
            </div>
          ) : (
            <Link to="/login" className="header-login-btn">Sign In</Link>
          )}
        </div>
      </div>

      <div className="header-bottom-row">
        <nav className="header-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`nav-link ${activePage === tab.id ? "active" : ""}`}
              onClick={() => handleNavigate(tab.id)}
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
              disabled
            >
              <option value="supabase">Supabase</option>
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
