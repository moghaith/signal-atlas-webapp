import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { get, post, patch, storeTokens, clearTokens, getStoredToken } from '../services/apiClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async () => {
    try {
      const data = await get('/api/users/me', { auth: true })
      setProfile(data)
      setUser({ id: data.id, email: data.email })
    } catch {
      setProfile(null)
      setUser(null)
    }
  }, [])

  useEffect(() => {
    const token = getStoredToken()
    if (token) {
      fetchProfile().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [fetchProfile])

  async function signUp(email, password, username) {
    const data = await post('/api/auth/register', { email, password, username })
    storeTokens(data.access_token, data.refresh_token)
    setUser({ id: data.user.id, email })
    setProfile(data.user)
    return data
  }

  async function signIn(email, password) {
    const data = await post('/api/auth/login', { email, password })
    storeTokens(data.access_token, data.refresh_token)
    setUser({ id: data.user.id, email })
    setProfile(data.user)
    return data
  }

  async function signOut() {
    try {
      await post('/api/auth/logout', {}, { auth: true })
    } catch {
    }
    clearTokens()
    setUser(null)
    setProfile(null)
  }

  async function updateProfile(updates) {
    const data = await patch('/api/users/me', updates, { auth: true })
    setProfile(data)
    return data
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signUp,
      signIn,
      signOut,
      updateProfile,
      refreshProfile: (updated) => {
        if (updated) {
          setProfile(updated)
        } else {
          fetchProfile()
        }
      },
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
