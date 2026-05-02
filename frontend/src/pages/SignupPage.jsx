import { useState } from 'react'
import Map from 'react-map-gl'
import styles from './SignupPage.module.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

export default function SignupPage({ defaultMode = 'register', onSuccess, onBack, onSkip }) {
  const [mode, setMode] = useState(defaultMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'register') {
        const res = await fetch('/api/users/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.detail || 'Registration failed')
        }
        // Auto-login after registration
        const formData = new URLSearchParams()
        formData.append('username', email)
        formData.append('password', password)
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        })
        if (!loginRes.ok) throw new Error('Registration succeeded, but auto-login failed')
        const data = await loginRes.json()
        localStorage.setItem('token', data.access_token)
      } else {
        const formData = new URLSearchParams()
        formData.append('username', email)
        formData.append('password', password)
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.detail || 'Incorrect email or password')
        }
        const data = await res.json()
        localStorage.setItem('token', data.access_token)
      }
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(m => m === 'register' ? 'login' : 'register')
    setError(null)
  }

  return (
    <div className={styles.root}>
      {/* Full-screen dark map background */}
      <div className={styles.mapBg}>
        <Map
          initialViewState={{
            longitude: -73.9845,
            latitude: 40.7549,
            zoom: 13.2,
            pitch: 0,
            bearing: -8,
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
          interactive={false}
          attributionControl={false}
        />
        <div className={styles.mapOverlay} />
      </div>

      <div className={styles.card}>
        {/* Logo */}
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          OnTime
        </button>

        <div className={styles.titleGroup}>
          <h1 className={styles.title}>
            {mode === 'register' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className={styles.sub}>
            {mode === 'register'
              ? 'Save your favorite routes and get personalized predictions.'
              : 'Sign in to access your saved trips and favorites.'}
          </p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={styles.input}
              autoComplete="email"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className={styles.input}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          </div>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading
              ? <span className={styles.spinner} />
              : (mode === 'register' ? 'Create account' : 'Sign in')}
          </button>
        </form>

        <div className={styles.switchRow}>
          {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" className={styles.switchBtn} onClick={switchMode}>
            {mode === 'register' ? 'Sign in' : 'Create one'}
          </button>
        </div>

        <div className={styles.divider}>
          <span>or</span>
        </div>

        <button className={styles.skipBtn} onClick={onSkip}>
          Continue without an account
        </button>
      </div>
    </div>
  )
}
