import Select from "react-select";
import "./Header.css";
import logo from "../../assets/logo_transparent_with_border.png";
import { selectStyles } from "../../styles/selectStyles";

import {
  LayoutDashboard,
  GitCompare,
  Map,
  BarChart3,
  RefreshCw,
  MapPin,
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
    { id: "coverage", label: "Coverage Request", icon: MapPin },
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
                styles={selectStyles}
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
                styles={selectStyles}
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