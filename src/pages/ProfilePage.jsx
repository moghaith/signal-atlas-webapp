import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Header from '../components/Header/Header'
import './ProfilePage.css'

export default function ProfilePage({ activePage, onNavigate, apiMode, onApiModeChange }) {
  const { user, profile, loading, signOut, updateProfile } = useAuth()
  const [username, setUsername] = useState(profile?.username || '')
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setUsername(profile?.username || '')
    setDisplayName(profile?.display_name || '')
  }, [profile])

  if (loading) {
    return (
      <div className="page">
        <Header activePage={activePage} onNavigate={onNavigate} apiMode={apiMode} onApiModeChange={onApiModeChange} />
        <main className="page-content">
          <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>Loading...</div>
        </main>
      </div>
    )
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await updateProfile({ username, display_name: displayName })
      setMessage('Profile updated!')
    } catch (err) {
      setMessage(err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <Header
        activePage={activePage}
        onNavigate={onNavigate}
        apiMode={apiMode}
        onApiModeChange={onApiModeChange}
      />
      <main className="page-content">
        <section className="page-intro">
          <span className="page-tag">Account</span>
          <h2>My Profile</h2>
        </section>

        <div className="profile-card">
          <div className="profile-email">
            Signed in as <strong>{user?.email}</strong>
          </div>

          <form onSubmit={handleSave} className="profile-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="displayName">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
              />
            </div>

            {message && <div className={`form-message ${message === 'Profile updated!' ? 'success' : ''}`}>{message}</div>}

            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>

          <div className="profile-actions">
            <button className="btn-logout" onClick={signOut}>
              Sign Out
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
