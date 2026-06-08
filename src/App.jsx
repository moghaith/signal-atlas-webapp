import { useState, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Mockup from './Mockup'

const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const MapPage = lazy(() => import('./pages/MapPage'))
const ComparisonPage = lazy(() => import('./pages/ComparisonPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const OperatorComparisonPage = lazy(() => import('./pages/OperatorComparisonPage'))
const CoverageRequestPage = lazy(() => import('./pages/CoverageRequestPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#475569', fontSize: 14 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 48, margin: 0, color: '#94a3b8' }}>404</h1>
        <p>Page not found</p>
        <a href="/" style={{ color: '#2563eb' }}>Go home</a>
      </div>
    </div>
  )
}

function AppRoutes() {
  const [apiMode, setApiMode] = useState('supabase')
  const [activePage, setActivePage] = useState('overview')

  function handleApiModeChange(mode) {
    setApiMode(mode)
  }

  function handleNavigate(page) {
    setActivePage(page)
  }

  const pageProps = {
    activePage,
    onNavigate: handleNavigate,
    apiMode,
    onApiModeChange: handleApiModeChange,
  }

  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#475569', fontSize: 14 }}>
        Loading dashboard...
      </div>
    }>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route
          path="/overview"
          element={
            <ProtectedRoute>
              <OverviewPage {...pageProps} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/comparison"
          element={
            <ProtectedRoute>
              <ComparisonPage {...pageProps} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <MapPage {...pageProps} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <ReportsPage {...pageProps} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/operators"
          element={
            <ProtectedRoute>
              <OperatorComparisonPage {...pageProps} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage {...pageProps} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/coverage-request"
          element={
            <ProtectedRoute>
              <CoverageRequestPage {...pageProps} />
            </ProtectedRoute>
          }
        />
        <Route path="/mockup" element={<Mockup />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
