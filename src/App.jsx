import { Suspense, lazy, useState } from "react";
import { useAuth } from "./contexts/AuthContext";
import Header from "./components/Header/Header";
import useDeviceData from "./hooks/useDeviceData";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import './App.css'// index.js
import './styles/mobile.css';

const OverviewPage     = lazy(() => import("./pages/OverviewPage"));
const MapPage          = lazy(() => import("./pages/MapPage"));
const PredictionInsightsPage   = lazy(() => import("./pages/ComparisonPage"));
const RegionalComparisonPage      = lazy(() => import("./pages/RegionalComparisonPage"));
const StatisticsPage = lazy(() => import("./pages/Statisticspage"));
const CoverageRequestsPage = lazy(() => import("./pages/coverage/CoverageRequestPage"));

function AppShell() {
  const [activePage, setActivePage] = useState("overview");
  const [showLogin,  setShowLogin]  = useState(false);
  const { profile } = useAuth();
  const apiMode = "supabase";

  const deviceData = useDeviceData(apiMode);
  const { 
    countries, 
    cities, 
    selectedCountry, 
    setSelectedCountry,
    selectedCity, 
    setSelectedCity, 

    loading, 
    refresh 
  } = deviceData;

  const handleLoginBtn = () => {
    if (profile) {
      setActivePage("profile");
    } else {
      setShowLogin(true);
    }
  };

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
        onLoginClick={handleLoginBtn}
      />

      <Suspense fallback={
        <div style={{ minHeight: "60vh", display: "grid", placeItems: "center",
                      color: "var(--color-text-secondary)", fontSize: 14 }}>
          Loading...
        </div>
      }>
        <PageContent
          activePage={activePage}
          deviceData={deviceData}
          apiMode={apiMode}
          onNavigate={setActivePage}
          openLoginModal={handleLoginBtn}
        />
      </Suspense>

      {showLogin && (
        <LoginPage
          onClose={() => setShowLogin(false)}
          onDone={() => {
            setShowLogin(false);
            setActivePage("profile");
          }}
        />
      )}
    </div>
  );
}

function PageContent({ activePage, deviceData, apiMode, onNavigate, openLoginModal }) {
  const sharedProps = { deviceData, apiMode };
  switch (activePage) {
    case "predictions":  return <PredictionInsightsPage {...sharedProps} />;
    case "map":          return <MapPage                {...sharedProps} />;
    case "regions":      return <RegionalComparisonPage {...sharedProps} />;
    case "coverage":     return <CoverageRequestsPage   {...sharedProps} openLoginModal={openLoginModal} />;
    case "statistics": return <StatisticsPage           {...sharedProps} />;
    case "profile":      return <ProfilePage onBack={() => onNavigate("overview") } onLoginClick={openLoginModal}/>;
    default:             return <OverviewPage           {...sharedProps} />;
  }
}

function App() {
  return (
    <>
      <AppShell />
    </>
  );
}

export default App;
