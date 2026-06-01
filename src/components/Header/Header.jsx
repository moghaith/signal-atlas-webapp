import { useState } from "react";
import Select from "react-select";
import "./Header.css";
import { useAuth } from "../../AuthContext";
import logo from "../../assets/logo_transparent_with_border.png";
import { selectStyles } from "../../styles/selectStyles";

import {
  LayoutDashboard,
  GitCompare,
  Map,
  BarChart3,
  RefreshCw,
  MapPin,
  ChevronDown,
  User,
} from "lucide-react";

function Header({ 
  activePage, 
  onNavigate, 
  onRefresh, 
  loading,

  countries, 
  cities, 
  selectedCountry, 
  selectedCity,

  onCountryChange, onCityChange, onLoginClick }) {
  const { profile } = useAuth();

  const [filtersOpen, setFiltersOpen] = useState(true);

  const tabs = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "detail", label: "Comparison", icon: GitCompare },
    { id: "map", label: "Map View", icon: Map },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "coverage", label: "Coverage Request", icon: MapPin },
  ];

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

      {/* TOP ROW */}
      <div className="header-row">

        <div className="header-logo">
          <img
            src={logo}
            alt="Signal Atlas"
            className="logo-img"
          />
          <span className="logo-text">Signal Atlas</span>
        </div>

        <nav className="header-nav">
          {tabs.map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                className={`nav-link ${
                  activePage === tab.id ? "active" : ""
                }`}
                onClick={() => onNavigate?.(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="header-actions">

          <button className="login-btn" onClick={onLoginClick}>
            <User size={15} />
            <span>{profile ? profile.username : "Login"}</span>
          </button>

          <button
            className={`filter-toggle-btn ${
              filtersOpen ? "open" : ""
            }`}
            onClick={() => setFiltersOpen((v) => !v)}
            title={
              filtersOpen
                ? "Hide filters"
                : "Show filters"
            }
          >
            <ChevronDown size={18} />
          </button>

        </div>

      </div>

      {/* FILTER ROW */}
      <div
        className={`filter-row-wrapper ${
          filtersOpen ? "open" : ""
        }`}
      >
        <div className="filter-row">

          <div className="filter-left">

            <div className="filter-group">
              <span className="filter-label">
                Country
              </span>

              <div className="filter-select">
                <Select
                  value={countryOptions.find(
                    (o) => o.value === selectedCountry
                  )}
                  onChange={(opt) =>
                    onCountryChange?.(opt?.value)
                  }
                  options={countryOptions}
                  styles={selectStyles}
                  isSearchable={false}
                />
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">
                City
              </span>

              <div className="filter-select">
                <Select
                  value={cityOptions.find(
                    (o) => o.value === selectedCity
                  )}
                  onChange={(opt) =>
                    onCityChange?.(opt?.value)
                  }
                  options={cityOptions}
                  styles={selectStyles}
                  isSearchable={false}
                />
              </div>
            </div>

          </div>

          <button
            className="refresh-btn"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              className={
                loading
                  ? "refresh-icon spinning"
                  : "refresh-icon"
              }
            />
          </button>

        </div>
      </div>
    </header>
  );
}

export default Header;
