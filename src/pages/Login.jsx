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

        <div style={styles.header}>
          <div style={styles.agentship}>AGENTSHIP</div>
          <p style={styles.tagline}>Grow your business. Keep your brand.</p>
        </div>

        <div style={styles.divider} />

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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={styles.footer}>
          Need access? Contact <a href="mailto:operations@agentship.com" style={styles.link}>operations@agentship.com</a>
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
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  header: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '36px 36px 28px',
  },
  agentship: {
    fontSize: '26px',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: '5px',
    textTransform: 'uppercase',
    fontFamily: 'Montserrat, sans-serif',
    marginBottom: '8px',
  },
  tagline: {
    fontSize: '11px',
    color: '#888',
    letterSpacing: '0.5px',
    fontStyle: 'italic',
    textAlign: 'center',
    fontFamily: 'Montserrat, sans-serif',
    margin: 0,
  },
  divider: {
    width: '100%',
    height: '1px',
    background: '#C9A84C',
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '32px 36px 0',
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
    fontFamily: 'Montserrat, sans-serif',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    background: '#0A0A0A',
    border: '0.5px solid #333',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#FFFFFF',
    fontFamily: 'Montserrat, sans-serif',
    boxSizing: 'border-box',
  },
  error: {
    fontSize: '12px',
    color: '#e07070',
    textAlign: 'center',
    padding: '8px 12px',
    background: 'rgba(224, 112, 112, 0.08)',
    borderRadius: '6px',
    border: '0.5px solid rgba(224, 112, 112, 0.2)',
    fontFamily: 'Montserrat, sans-serif',
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
    cursor: 'pointer',
    border: 'none',
  },
  footer: {
    fontSize: '11px',
    color: '#555',
    margin: '24px 0 32px',
    textAlign: 'center',
    fontFamily: 'Montserrat, sans-serif',
  },
  link: {
    color: '#C9A84C',
    textDecoration: 'none',
  },
}
