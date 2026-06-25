import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoBlock}>
          <div style={styles.logoIcon}>A</div>
          <div style={styles.logoText}>
            <span style={styles.poweredBy}>Powered by</span>
            <span style={styles.agentship}>AGENTSHIP</span>
          </div>
        </div>

        <p style={styles.tagline}>Grow your business. Keep your brand.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              required
              style={styles.input}
              autoComplete="email"
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
              autoComplete="current-password"
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={styles.footer}>
          Need access? Contact your Agentship leader.
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0A0A0A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: '#1E1E1E',
    border: '0.5px solid #2a2a2a',
    borderRadius: '16px',
    padding: '40px 36px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  logoBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  logoIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    background: '#C9A84C',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: '700',
    color: '#0A0A0A',
    fontFamily: 'Montserrat, sans-serif',
    letterSpacing: '-1px',
  },
  logoText: {
    display: 'flex',
    flexDirection: 'column',
  },
  poweredBy: {
    fontSize: '10px',
    fontWeight: '400',
    color: '#888',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    lineHeight: 1.2,
  },
  agentship: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: '3px',
    lineHeight: 1.1,
  },
  tagline: {
    fontSize: '11px',
    color: '#666',
    letterSpacing: '0.5px',
    marginBottom: '32px',
    textAlign: 'center',
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '11px',
    fontWeight: '500',
    color: '#888',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    background: '#0A0A0A',
    border: '0.5px solid #333',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#FFFFFF',
  },
  error: {
    fontSize: '12px',
    color: '#e07070',
    textAlign: 'center',
    padding: '8px 12px',
    background: 'rgba(224, 112, 112, 0.08)',
    borderRadius: '6px',
    border: '0.5px solid rgba(224, 112, 112, 0.2)',
  },
  button: {
    width: '100%',
    padding: '13px',
    background: '#C9A84C',
    color: '#0A0A0A',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    marginTop: '4px',
    fontFamily: 'Montserrat, sans-serif',
  },
  footer: {
    fontSize: '11px',
    color: '#555',
    marginTop: '24px',
    textAlign: 'center',
  },
}
