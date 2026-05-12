import "./Header.css";
import logo from "../../assets/logo_transparent_with_border.png";

import Select from "react-select";

import {
  LayoutDashboard,
  GitCompare,
  Map,
  BarChart3,
  RefreshCw,
} from "lucide-react";

function Header({
  activePage,
  onNavigate,
  onRefresh,
  loading,

  countries = [],
  cities = [],
  selectedCountry = "__all__",
  selectedCity = "__all__",
  onCountryChange,
  onCityChange,
}) {
  const tabs = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "detail", label: "Comparison", icon: GitCompare },
    { id: "map", label: "Map View", icon: Map },
    { id: "reports", label: "Reports", icon: BarChart3 },
  ];

  // React Select expects { value, label }
  const countryOptions = countries.map((c) => ({
    value: c.id,
    label: c.label,
  }));

  const cityOptions = cities.map((c) => ({
    value: c.id,
    label: c.label,
  }));

  const customStyles = {
    control: (base, state) => ({
      ...base,
      minWidth: 180,
      borderRadius: 12,
      borderColor: state.isFocused ? "#6b9ae8" : "#e2e8f0",
      boxShadow: state.isFocused
        ? "0 0 0 3px rgba(107, 154, 232, 0.15)"
        : "none",
      "&:hover": {
        borderColor: "#6b9ae8",
      },
      backgroundColor: "#fff",
      fontSize: 13,
    }),

    menu: (base) => ({
      ...base,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
    }),

    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "#6b9ae8"
        : state.isFocused
        ? "#f1f5ff"
        : "white",
      color: state.isSelected ? "white" : "#1e293b",
      fontSize: 13,
      cursor: "pointer",
    }),
  };

  return (
    <header className="header-shell">
      <div className="header-row">

        {/* LOGO */}
        <div className="header-logo">
          <img src={logo} alt="Signal Atlas" className="logo-img" />
          <span className="logo-text">Signal Atlas</span>
        </div>

        {/* NAV */}
        <nav className="header-nav">
          {tabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                className={`nav-link ${activePage === tab.id ? "active" : ""}`}
                onClick={() => onNavigate?.(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* RIGHT CONTROLS */}
        <div className="header-right">

          <div className="header-device-wrap">

            {/* COUNTRY */}
            <div className="header-device-group">
              <span className="header-device-label">Country</span>
              <Select
                value={countryOptions.find((o) => o.value === selectedCountry)}
                onChange={(opt) => onCountryChange?.(opt?.value)}
                options={countryOptions}
                styles={customStyles}
                isSearchable={false}
              />
            </div>

            {/* CITY */}
            <div className="header-device-group">
              <span className="header-device-label">City</span>
              <Select
                value={cityOptions.find((o) => o.value === selectedCity)}
                onChange={(opt) => onCityChange?.(opt?.value)}
                options={cityOptions}
                styles={customStyles}
                isSearchable={false}
              />
            </div>

          </div>

          {/* REFRESH */}
          <button
            className="refresh-btn"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh data"
          >
            <RefreshCw
              size={16}
              className={loading ? "refresh-icon spinning" : "refresh-icon"}
            />
          </button>

        </div>

      </div>
    </header>
  );
}

export default Header;