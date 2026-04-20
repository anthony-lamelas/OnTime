import { useState } from 'react'
import styles from './TripPlanner.module.css'
import loginStyles from './LoginPanel.module.css'
import SidebarNav from './SidebarNav'

export default function LoginPanel({ setView, isLoggedIn, setIsLoggedIn }) {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      let res;
      if (isRegister) {
        res = await fetch('/api/users/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        })
      } else {
        const formData = new URLSearchParams()
        formData.append('username', email)
        formData.append('password', password)
        
        res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        })
      }

      if (!res.ok) {
        let errMessage = 'Authentication failed'
        try {
          const errData = await res.json()
          if (errData.detail) errMessage = errData.detail
        } catch (e) {}
        throw new Error(errMessage)
      }

      // Automatically login after successful registration
      if (isRegister) {
        const formData = new URLSearchParams()
        formData.append('username', email)
        formData.append('password', password)
        
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        })
        if (!loginRes.ok) throw new Error('Registration succeeded, but auto-login failed')
        const data = await loginRes.json()
        localStorage.setItem('token', data.access_token)
      } else {
        const data = await res.json()
        localStorage.setItem('token', data.access_token)
      }

      setIsLoggedIn(true)
      setView('home')
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || 'An error occurred during authentication')
    } finally {
      setLoading(false)
    }
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⊝</span>
          <span className={styles.logoText}>OnTime</span>
        </div>
        <p className={styles.tagline}>NYC Subway Planner</p>
      </div>
      
      <div className={loginStyles.backAction}>
         <button className={styles.resetBtn} onClick={() => setView('home')}>← Back to Planner</button>
      </div>

      <div className={loginStyles.content}>
        <h2 className={loginStyles.title}>{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
        
        {error && <div className={loginStyles.error}>{error}</div>}
        
        <form onSubmit={handleSubmit} className={loginStyles.form}>
          <div className={loginStyles.inputGroup}>
            <label>Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter email" 
            />
          </div>
          <div className={loginStyles.inputGroup}>
            <label>Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password" 
            />
          </div>
          
          <button type="submit" className={loginStyles.submitBtn} disabled={loading}>
            {loading ? 'Processing...' : (isRegister ? 'Register' : 'Login')}
          </button>
        </form>
        
        <div className={loginStyles.toggleMode}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Login' : 'Register'}
          </button>
        </div>
      </div>

      <SidebarNav 
        isLoggedIn={isLoggedIn} 
        currentView="login" 
        setView={setView} 
        onLogout={() => {
          localStorage.removeItem('token')
          setIsLoggedIn(false)
          setView('home')
        }} 
      />
    </aside>
  )
}
