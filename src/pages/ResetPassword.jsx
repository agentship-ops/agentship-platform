import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { RULES, isValidPassword } from '../lib/passwordRules'

// Where an agent lands after clicking the reset link in their email.
//
// How this works: the link carries a one-time recovery code. The Supabase
// client picks it up off the URL automatically and turns it into a temporary
// session, which is what lets updateUser() set a new password without the old
// one. That exchange is async, so this page waits for it rather than assuming
// it already happened.
export default function ResetPassword() {
  // 'checking' → waiting for the recovery session
  // 'ready'    → link was valid, show the form
  // 'invalid'  → link expired, already used, or opened directly
  // 'done'     → password changed
  const [status, setStatus] = useState('checking')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    let settled = false

    // An expired or already-used link comes back with the problem described in
    // the URL rather than a usable code.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const queryParams = new URLSearchParams(window.location.search)
    const linkError =
      hashParams.get('error_description') || queryParams.get('error_description')

    if (linkError) {
      setStatus('invalid')
      setError(linkError.replace(/\+/g, ' '))
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (settled) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        settled = true
        setStatus('ready')
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (settled) return
      if (session) {
        settled = true
        setStatus('ready')
      }
    })

    // If the exchange hasn't produced a session in a few seconds, the link
    // isn't usable. Without this the page would spin forever.
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        setStatus('invalid')
      }
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const meetsRules = isValidPassword(password)
  const matches = password.length > 0 && password === confirm
  const canSubmit = meetsRules && matches && !saving

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Requirements are shown live above, so this only catches a submit that
    // slipped through.
    if (!meetsRules) {
      setError('Your password does not meet all the requirements yet.')
      return
    }
    if (password !== confirm) {
      setError("Those passwords don't match.")
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (error) {
      // Surfaced verbatim so a server rule we haven't mirrored here is still
      // readable rather than mysterious.
      setError(error.message)
      return
    }

    setStatus('done')
    setTimeout(() => navigate('/dashboard'), 1800)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.agentship}>AGENTSHIP</div>
          <p style={styles.tagline}>Grow your business. Keep your brand.</p>
        </div>
        <div style={styles.divider} />

        {status === 'checking' && (
          <div style={styles.form}>
            <p style={styles.helpText}>Checking your link...</p>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <p style={styles.helpText}>Choose a new password for your account.</p>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>New Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={styles.input}
                autoComplete="new-password"
                autoFocus
              />
            </div>

            <PasswordChecklist password={password} />

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Confirm New Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                style={{
                  ...styles.input,
                  ...(confirm.length > 0 && !matches ? styles.inputBad : {}),
                }}
                autoComplete="new-password"
              />
              {confirm.length > 0 && !matches && (
                <span style={styles.mismatch}>These don't match yet</span>
              )}
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              style={{ ...styles.button, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            >
              {saving ? 'Saving...' : 'Set New Password'}
            </button>
          </form>
        )}

        {status === 'invalid' && (
          <div style={styles.form}>
            <p style={styles.error}>
              This reset link isn't valid anymore. Links expire after an hour and
              can only be used once.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={styles.button}
            >
              Request a New Link
            </button>
          </div>
        )}

        {status === 'done' && (
          <div style={styles.form}>
            <p style={styles.success}>
              Password updated. Taking you to the platform...
            </p>
          </div>
        )}

        <p style={styles.footer}>
          Need help? Contact <a href="mailto:operations@agentship.com" style={styles.link}>operations@agentship.com</a>
        </p>
      </div>
    </div>
  )
}

// Live requirement list. Visible before typing so nobody has to guess, and
// each line turns gold as it's satisfied.
function PasswordChecklist({ password }) {
  return (
    <div style={styles.checklist}>
      {RULES.map(rule => {
        const met = rule.test(password || '')
        return (
          <div key={rule.id} style={styles.checkRow}>
            <span style={{ ...styles.checkDot, ...(met ? styles.checkDotMet : {}) }}>
              {met ? '✓' : ''}
            </span>
            <span style={{ ...styles.checkLabel, ...(met ? styles.checkLabelMet : {}) }}>
              {rule.label}
            </span>
          </div>
        )
      })}
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
  inputBad: {
    borderColor: 'rgba(224,112,112,0.5)',
  },
  mismatch: {
    fontSize: '11px',
    color: '#e07070',
    fontFamily: 'Montserrat, sans-serif',
  },
  checklist: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '12px 14px',
    background: '#0A0A0A',
    border: '0.5px solid #2a2a2a',
    borderRadius: '8px',
    marginTop: '-6px',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
  },
  checkDot: {
    width: '15px',
    height: '15px',
    borderRadius: '50%',
    border: '1px solid #3a3a3a',
    color: '#0A0A0A',
    fontSize: '9px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    lineHeight: 1,
  },
  checkDotMet: {
    background: '#C9A84C',
    borderColor: '#C9A84C',
  },
  checkLabel: {
    fontSize: '11.5px',
    color: '#777',
    fontFamily: 'Montserrat, sans-serif',
  },
  checkLabelMet: {
    color: '#C9A84C',
  },
  error: {
    fontSize: '12px',
    color: '#e07070',
    textAlign: 'center',
    padding: '10px 14px',
    background: 'rgba(224, 112, 112, 0.08)',
    borderRadius: '6px',
    border: '0.5px solid rgba(224, 112, 112, 0.2)',
    fontFamily: 'Montserrat, sans-serif',
    lineHeight: 1.55,
    margin: 0,
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
