import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  // 'signin' is the normal login form. 'forgot' swaps the same card into
  // the reset-request form so there's no extra page to route to.
  const [mode, setMode] = useState('signin')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

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

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // redirectTo is built from the current origin so this works on the
    // production domain, a Vercel preview, or localhost without edits.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (error) {
      setError('Something went wrong sending that email. Please try again.')
      return
    }

    // Deliberately does not confirm whether the address exists — that would
    // let anyone check who is on the platform.
    setResetSent(true)
  }

  function switchMode(next) {
    setMode(next)
    setError('')
    setPassword('')
    setResetSent(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.agentship}>AGENTSHIP</div>
          <p style={styles.tagline}>Grow your business. Keep your brand.</p>
        </div>
        <div style={styles.divider} />

        {mode === 'signin' && (
          <>
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

            <button
              type="button"
              onClick={() => switchMode('forgot')}
              style={styles.textLinkBtn}
            >
              Forgot password?
            </button>
          </>
        )}

        {mode === 'forgot' && !resetSent && (
          <>
            <form onSubmit={handleReset} style={styles.form}>
              <p style={styles.helpText}>
                Enter your Agentship email and we'll send you a link to set a new password.
              </p>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@agentship.com"
                  required
                  style={styles.input}
                  autoComplete="email"
                  autoFocus
                />
              </div>
              {error && <p style={styles.error}>{error}</p>}
              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => switchMode('signin')}
              style={styles.textLinkBtn}
            >
              Back to sign in
            </button>
          </>
        )}

        {mode === 'forgot' && resetSent && (
          <>
            <div style={styles.form}>
              <p style={styles.success}>
                Check your email. If that address is on the platform, a reset link
                is on its way. The link expires in one hour.
              </p>
              <p style={styles.helpTextSmall}>
                Nothing after a few minutes? Check your spam folder, or reach out
                to operations.
              </p>
            </div>

            <button
              type="button"
              onClick={() => switchMode('signin')}
              style={styles.textLinkBtn}
            >
              Back to sign in
            </button>
          </>
        )}

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
  success: {
    fontSize: '13px',
    color: '#6ec46e',
    textAlign: 'center',
    padding: '14px 16px',
    background: 'rgba(110, 196, 110, 0.08)',
    borderRadius: '8px',
    border: '0.5px solid rgba(110, 196, 110, 0.2)',
    fontFamily: 'Montserrat, sans-serif',
    lineHeight: 1.55,
    margin: 0,
  },
  helpText: {
    fontSize: '12.5px',
    color: '#888',
    textAlign: 'center',
    fontFamily: 'Montserrat, sans-serif',
    lineHeight: 1.55,
    margin: 0,
  },
  helpTextSmall: {
    fontSize: '11px',
    color: '#555',
    textAlign: 'center',
    fontFamily: 'Montserrat, sans-serif',
    lineHeight: 1.55,
    margin: 0,
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
  textLinkBtn: {
    background: 'transparent',
    border: 'none',
    color: '#C9A84C',
    fontSize: '12px',
    fontWeight: '500',
    fontFamily: 'Montserrat, sans-serif',
    cursor: 'pointer',
    marginTop: '18px',
    padding: '4px 8px',
  },
  footer: {
    fontSize: '11px',
    color: '#555',
    margin: '18px 0 32px',
    textAlign: 'center',
    fontFamily: 'Montserrat, sans-serif',
  },
  link: {
    color: '#C9A84C',
    textDecoration: 'none',
  },
}
