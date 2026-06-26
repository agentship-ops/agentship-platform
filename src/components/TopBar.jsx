import { useState, useRef, useEffect } from 'react'

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  )
}

function IconBell() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

function IconGear() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

export default function TopBar({ onToggleSidebar }) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const notifRef = useRef(null)
  const settingsRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div style={styles.topbar}>

      <button onClick={onToggleSidebar} aria-label="Toggle sidebar" style={styles.hbtn}>
        <IconMenu />
      </button>

      <span style={styles.agentship}>AGENTSHIP</span>

      <div style={{ flex: 1 }} />

      <div style={styles.right}>

        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            aria-label="Notifications"
            style={styles.iconBtn}
            onClick={() => { setNotifOpen(o => !o); setSettingsOpen(false) }}
          >
            <IconBell />
          </button>
          <span style={styles.notifDot} />
          {notifOpen && (
            <div style={styles.dropdown}>
              <p style={styles.dropdownTitle}>Notifications</p>
              <p style={styles.dropdownEmpty}>You're all caught up.</p>
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={settingsRef}>
          <button
            aria-label="Settings"
            style={styles.iconBtn}
            onClick={() => { setSettingsOpen(o => !o); setNotifOpen(false) }}
          >
            <IconGear />
          </button>
          {settingsOpen && (
            <div style={{ ...styles.dropdown, right: 0 }}>
              <p style={styles.dropdownTitle}>Settings</p>
              <p style={styles.dropdownEmpty}>Platform settings coming soon.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

const styles = {
  topbar: {
    height: '54px',
    background: '#0f0f0f',
    borderBottom: '1px solid #2a2a2a',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: '14px',
    flexShrink: 0,
  },
  hbtn: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'transparent',
    border: 'none',
    color: '#C9A84C',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  agentship: {
    fontSize: '17px',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: '4px',
    textTransform: 'uppercase',
    fontFamily: 'Montserrat, sans-serif',
    flexShrink: 0,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  iconBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    display: 'block',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#C9A84C',
    position: 'absolute',
    top: '5px',
    right: '5px',
    pointerEvents: 'none',
  },
  dropdown: {
    position: 'absolute',
    top: '44px',
    right: '-8px',
    width: '210px',
    background: '#1E1E1E',
    border: '0.5px solid #2a2a2a',
    borderRadius: '10px',
    padding: '14px 16px',
    zIndex: 200,
    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
  },
  dropdownTitle: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#888',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    marginBottom: '10px',
    fontFamily: 'Montserrat, sans-serif',
  },
  dropdownEmpty: {
    fontSize: '13px',
    color: '#555',
    fontFamily: 'Montserrat, sans-serif',
    lineHeight: 1.5,
  },
}
