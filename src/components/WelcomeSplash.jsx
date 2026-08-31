import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'

// Shows a quiet, once-per-day welcome when an agent arrives.
// Self-contained: greeting, name, fade, and dismiss all live here.

const STORAGE_KEY = 'agentship_welcome_last_seen'

// Local calendar date as YYYY-MM-DD, used to show the splash
// at most once per day per browser.
function todayKey() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function greetingWord() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function WelcomeSplash() {
  const { profile, loading } = useAuth()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  // Decide whether to show — only after the profile has loaded,
  // so the agent's name is ready.
  useEffect(() => {
    if (loading || !profile) return
    let seen = null
    try { seen = localStorage.getItem(STORAGE_KEY) } catch { seen = null }

    // To show on EVERY login instead of once per day, delete the
    // line below and just call setMounted(true) unconditionally.
    if (seen !== todayKey()) {
      setMounted(true)
      requestAnimationFrame(() => setVisible(true)) // fade in next frame
    }
  }, [loading, profile])

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, todayKey()) } catch {}
    setVisible(false)
    setTimeout(() => setMounted(false), 220) // let the fade-out finish
  }

  // Escape key also dismisses.
  useEffect(() => {
    if (!mounted) return
    function onKey(e) { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted])

  if (!mounted) return null

  const first = profile?.first_name?.trim()
  const greeting = first ? `${greetingWord()}, ${first}` : greetingWord()

  return (
    <div
      onClick={dismiss}
      role="button"
      aria-label="Continue to the platform"
      style={{ ...styles.overlay, opacity: visible ? 1 : 0 }}
    >
      <div style={{ ...styles.card, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}>
        <div style={styles.poweredBy}>Powered by</div>
        <div style={styles.wordmark}>AGENTSHIP</div>
        <div style={styles.greeting}>{greeting}</div>
        <div style={styles.tagline}>Grow your business. Keep your brand.</div>
        <div style={styles.hint}>Tap anywhere to continue</div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 10, 10, 0.94)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    zIndex: 9999,
    cursor: 'pointer',
    transition: 'opacity 0.22s ease',
    fontFamily: 'Montserrat, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#1E1E1E',
    border: '0.5px solid #2a2a2a',
    borderRadius: '16px',
    padding: '56px 40px',
    textAlign: 'center',
    transition: 'transform 0.22s ease',
  },
  poweredBy: {
    fontSize: '9px',
    color: '#888',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
  },
  wordmark: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: '4px',
    marginTop: '2px',
  },
  greeting: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: '48px',
    letterSpacing: '-0.3px',
  },
  tagline: {
    fontSize: '13px',
    color: '#888',
    marginTop: '12px',
    fontStyle: 'italic',
  },
  hint: {
    fontSize: '11px',
    color: '#555',
    marginTop: '48px',
    letterSpacing: '0.5px',
  },
}
