import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AcceptInvite() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
      } else {
        setError('This invite link is invalid or has expired. Please contact operations@agentship.com for a new invite.')
      }
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { first_name: firstName.trim(), last_name: lastName.trim() }
    })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { error: profileError } = await supabase.rpc('set_profile', {
      user_id: user.id,
      first: firstName.trim(),
      last: lastName.trim()
    })

    if (profileError) {
      setError('Account created but profile update failed. Please contact operations@agentship.com.')
      setLoading(false)
      return
    }

    navigate('/dashboard')
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        <div style={styles.header}>
          <div style={styles.agentship}>AGENTSHIP</div>
          <p style={styles.tagline}>Grow your business. Keep your brand.</p>
        </div>

        <div style={styles.divider} />

        {!sessionReady && !error && (
          <p style={styles.loading}>Verifying your invite...</p>
        )}

        {error && !sessionReady && (
          <p style={styles.errorBox}>{error}</p>
        )}

        {sessionReady && (
          <>
            <div style={styles.welcome}>
              <h1 style={styles.title}>Set up your account!</h1>
              <p style={styles.subtitle}>Enter your full name and create a password.</p>
            </div>

            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.row}>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="First"
                    required
                    style={styles.input}
                  />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Last"
                    required
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Create Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  style={styles.input}
                />
              </div>

              {error && <p style={styles.errorBox}>{error}</p>}

              <button type="submit" disabled={loading} style={styles.button}>
                {loading ? 'Setting up your account...' : 'Enter the Platform'}
              </button>
            </form>
          </>
        )}

        <p style={styles.footer}>
          Questions? Contact <a href="mailto:operations@agentship.com" style={styles.link}>operations@agentship.com</a>
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
    maxWidth: '440px',
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
  welcome: {
    width: '100%',
    padding: '28px 36px 0',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: '-0.2px',
    marginBottom: '8px',
    fontFamily: 'Montserrat, sans-serif',
  },
  subtitle: {
    fontSize: '13px',
    color: '#666',
    lineHeight: 1.6,
    fontFamily: 'Montserrat, sans-serif',
    margin: 0,
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '24px 36px 0',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
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
  errorBox: {
    fontSize: '12px',
    color: '#e07070',
    textAlign: 'center',
    padding: '8px 12px',
    background: 'rgba(224, 112, 112, 0.08)',
    borderRadius: '6px',
    border: '0.5px solid rgba(224, 112, 112, 0.2)',
    fontFamily: 'Montserrat, sans-serif',
    lineHeight: 1.5,
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
  loading: {
    fontSize: '13px',
    color: '#666',
    fontFamily: 'Montserrat, sans-serif',
    padding: '24px 36px',
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
