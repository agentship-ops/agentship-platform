import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ResourceAudible() {
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let alive = true
    supabase
      .from('team_shared_accounts')
      .select('login_email, login_password')
      .eq('slug', 'audible')
      .single()
      .then(({ data, error }) => {
        if (!alive) return
        if (error || !data) setFailed(true)
        else setAccount(data)
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  function copy(text, which) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which)
      setTimeout(() => setCopied(''), 1600)
    })
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.eyebrow}>Resource Library</div>
        <h1 style={styles.title}>Team Audible Account</h1>
        <p style={styles.subtitle}>
          Shared access to Audible for team book studies and independent learning.
          Log in through the Audible website or the mobile app.
        </p>
      </div>

      <div style={styles.card}>
        <div style={styles.cardLabel}>
          <i className="ti ti-key" aria-hidden="true" style={{ fontSize: '15px' }} />
          Login information
        </div>

        {loading && (
          <p style={styles.loading}>Loading your login…</p>
        )}

        {failed && (
          <p style={styles.failed}>
            <i className="ti ti-alert-triangle" aria-hidden="true" style={{ fontSize: '13px' }} />
            {' '}Couldn&apos;t load the login. Refresh the page, and if it keeps happening, contact Melissa Kenck.
          </p>
        )}

        {account && (
          <>
            <div style={styles.credRow}>
              <div style={styles.credText}>
                <div style={styles.credLabel}>Email</div>
                <div style={styles.credValue}>{account.login_email}</div>
              </div>
              <button
                onClick={() => copy(account.login_email, 'email')}
                style={styles.ghostBtn}
              >
                <i className={`ti ${copied === 'email' ? 'ti-check' : 'ti-copy'}`} aria-hidden="true" style={{ fontSize: '14px' }} />
                {copied === 'email' ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div style={styles.credRow}>
              <div style={styles.credText}>
                <div style={styles.credLabel}>Password</div>
                <div style={{ ...styles.credValue, letterSpacing: revealed ? '0' : '2px' }}>
                  {revealed ? account.login_password : '••••••••••'}
                </div>
              </div>
              <div style={styles.credActions}>
                <button
                  onClick={() => setRevealed(r => !r)}
                  style={styles.ghostBtn}
                >
                  <i className={`ti ${revealed ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true" style={{ fontSize: '14px' }} />
                  {revealed ? 'Hide' : 'Reveal'}
                </button>
                <button
                  onClick={() => copy(account.login_password, 'password')}
                  style={styles.goldBtn}
                >
                  <i className={`ti ${copied === 'password' ? 'ti-check' : 'ti-copy'}`} aria-hidden="true" style={{ fontSize: '14px' }} />
                  {copied === 'password' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={styles.card}>
        <div style={styles.cardLabel}>
          <i className="ti ti-users" aria-hidden="true" style={{ fontSize: '15px' }} />
          Shared account guidelines
        </div>

        <div style={styles.guide}>
          <i className="ti ti-fingerprint-off" aria-hidden="true" style={styles.guideIcon} />
          <div>
            <div style={styles.guideTitle}>Do not enable passkeys or Face ID</div>
            <div style={styles.guideBody}>
              Skip personal authentication methods like passkeys, Face ID, or Touch ID when logging in.
            </div>
          </div>
        </div>

        <div style={styles.guide}>
          <i className="ti ti-shopping-cart-off" aria-hidden="true" style={styles.guideIcon} />
          <div>
            <div style={styles.guideTitle}>Do not purchase books</div>
            <div style={styles.guideBody}>
              Titles are added and managed centrally. Want one added? Submit the request to leadership.
            </div>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardLabel}>
          <i className="ti ti-bookmark" aria-hidden="true" style={{ fontSize: '15px' }} />
          Best practice
        </div>
        <p style={styles.bestPractice}>
          Multiple people may be listening at different times, so Audible can reopen a book in a
          different spot than where you left off. Before you close the app, jot down the chapter or
          timestamp where you stopped so you can pick right back up.
        </p>
      </div>

      <p style={styles.hint}>
        <i className="ti ti-info-circle" aria-hidden="true" style={{ fontSize: '13px' }} />
        {' '}Trouble getting in, or need a book added for a study? Contact Melissa Kenck.
      </p>
    </div>
  )
}

const styles = {
  page: {
    padding: '28px 32px',
    maxWidth: '860px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    marginBottom: '4px',
  },
  eyebrow: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '1.4px',
    textTransform: 'uppercase',
    color: '#C9A84C',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: '13px',
    color: '#888',
    lineHeight: 1.7,
    maxWidth: '620px',
  },
  card: {
    background: '#1E1E1E',
    border: '0.5px solid #2a2a2a',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  cardLabel: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: '#C9A84C',
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  },
  loading: {
    fontSize: '12px',
    color: '#777',
    margin: 0,
  },
  failed: {
    fontSize: '12px',
    color: '#e07070',
    lineHeight: 1.6,
    margin: 0,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '5px',
  },
  credRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 14px',
    background: '#0A0A0A',
    border: '0.5px solid #333',
    borderRadius: '8px',
  },
  credText: {
    minWidth: 0,
  },
  credLabel: {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  credValue: {
    fontSize: '14px',
    color: '#FFFFFF',
    marginTop: '3px',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  credActions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  ghostBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: '600',
    padding: '8px 12px',
    borderRadius: '8px',
    background: 'transparent',
    color: '#FFFFFF',
    border: '0.5px solid #444',
    cursor: 'pointer',
    fontFamily: 'Montserrat, sans-serif',
    flexShrink: 0,
  },
  goldBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: '600',
    padding: '8px 12px',
    borderRadius: '8px',
    background: '#C9A84C',
    color: '#0A0A0A',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'Montserrat, sans-serif',
    flexShrink: 0,
  },
  guide: {
    display: 'flex',
    gap: '11px',
  },
  guideIcon: {
    fontSize: '18px',
    color: '#C9A84C',
    flexShrink: 0,
    marginTop: '1px',
  },
  guideTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  guideBody: {
    fontSize: '12px',
    color: '#888',
    lineHeight: 1.6,
    marginTop: '2px',
  },
  bestPractice: {
    fontSize: '12px',
    color: '#888',
    lineHeight: 1.7,
    margin: 0,
  },
  hint: {
    fontSize: '11px',
    color: '#555',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    margin: 0,
    marginTop: '2px',
  },
}
