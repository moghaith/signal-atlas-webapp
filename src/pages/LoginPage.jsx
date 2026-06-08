import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './LoginPage.css'

export default function LoginPage() {
  const { signIn, signUp, user } = useAuth()
  const navigate = useNavigate()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (isSignUp) {
        await signUp(email, password)
        setError('Check your email for the confirmation link!')
      } else {
        await signIn(email, password)
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError(err.message || 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Signal Atlas</h1>
          <p>{isSignUp ? 'Create an account' : 'Sign in to your account'}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <div className="form-message">{error}</div>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <button
            type="button"
            className="btn-link"
            onClick={() => { setIsSignUp(!isSignUp); setError('') }}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  )
}
