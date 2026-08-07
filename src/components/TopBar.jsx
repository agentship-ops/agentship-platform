import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { enablePush, currentPermission } from '../lib/push'

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
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

const CHANNEL_TO_VIEW = { agentship: 'ch-agentship' }
const CHANNEL_LABEL = { agentship: '# Agentship' }

function actorName(n) {
  return `${n.actor_first || 'Someone'}${n.actor_last ? ' ' + n.actor_last : ''}`
}

function isDmNotif(n) {
  return n.type === 'dm' || n.type === 'dm_reaction' || (n.channel && n.channel.startsWith('dm:'))
}

function timeAgo(iso) {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function TopBar({ onToggleSidebar, onNavigate, dmUnread = 0 }) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [pushMsg, setPushMsg] = useState('')
  const [pushBusy, setPushBusy] = useState(false)
  const notifRef = useRef(null)
  const settingsRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setCurrentUser(data?.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null)
    })
    return () => { sub?.subscription?.unsubscribe() }
  }, [])

  const loadNotifs = useCallback(async () => {
    if (!currentUser) return
    const { data } = await supabase
      .from('notifications')
      .select('id, type, actor_first, actor_last, channel, message_id, preview, read, created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data || [])
  }, [currentUser])

  useEffect(() => {
    loadNotifs()
    if (!currentUser) return
    const ch = supabase
      .channel('rt-notifications')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
        loadNotifs)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadNotifs, currentUser])

  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  async function markAllRead() {
    if (!currentUser || unreadCount === 0) return
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    await supabase.from('notifications').update({ read: true })
      .eq('user_id', currentUser.id).eq('read', false)
  }

  function toggleBell() {
    const willOpen = !notifOpen
    setNotifOpen(willOpen)
    setSettingsOpen(false)
    if (willOpen) markAllRead()
  }

  function openNotification(n) {
    setNotifOpen(false)
    if (isDmNotif(n)) {
      if (onNavigate) onNavigate('messages')
      return
    }
    const view = CHANNEL_TO_VIEW[n.channel] || 'ch-agentship'
    if (onNavigate) onNavigate(view)
  }

  async function handleEnablePush() {
    setPushBusy(true)
    setPushMsg('Setting up...')
    const res = await enablePush()
    setPushMsg(res.message)
    setPushBusy(false)
  }

  const perm = currentPermission()
  const pushButtonLabel =
    perm === 'granted' ? 'Notifications are on'
    : perm === 'denied' ? 'Blocked — enable in device settings'
    : 'Turn on notifications'

  return (
    <div style={styles.topbar}>

      <button onClick={onToggleSidebar} aria-label="Toggle sidebar" style={styles.hbtn}>
        <IconMenu />
      </button>

      <span style={styles.agentship}>AGENTSHIP</span>

      <div style={{ flex: 1 }} />

      <div style={styles.right}>

        <div style={{ position: 'relative' }}>
          <button
            aria-label="Messages"
            style={styles.iconBtn}
            onClick={() => { if (onNavigate) onNavigate('messages'); setNotifOpen(false); setSettingsOpen(false) }}
          >
            <IconMessage />
          </button>
          {dmUnread > 0 && (
            <span style={styles.msgBadge}>{dmUnread > 9 ? '9+' : dmUnread}</span>
          )}
        </div>

        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            aria-label="Notifications"
            style={styles.iconBtn}
            onClick={toggleBell}
          >
            <IconBell />
          </button>
          {unreadCount > 0 && <span style={styles.notifDot} />}
          {notifOpen && (
            <div style={styles.dropdown}>
              <p style={styles.dropdownTitle}>Notifications</p>
              {notifications.length === 0 ? (
                <p style={styles.dropdownEmpty}>You're all caught up.</p>
              ) : (
                <div style={styles.notifList}>
                  {notifications.map(n => (
                    <button key={n.id} style={styles.notifItem} onClick={() => openNotification(n)}>
                      <span style={styles.notifLine}>
                        <strong style={{ color: '#fff', fontWeight: 600 }}>{actorName(n)}</strong>
                        {n.type === 'reaction'
                          ? <> reacted <span>{n.preview}</span></>
                          : n.type === 'dm'
                          ? <> messaged you</>
                          : n.type === 'dm_reaction'
                          ? <> reacted <span>{n.preview}</span></>
                          : <> replied to you</>}
                      </span>
                      <span style={styles.notifSub}>
                        {isDmNotif(n) ? 'Direct message' : (CHANNEL_LABEL[n.channel] || '# Agentship')} · {timeAgo(n.created_at)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
            <div style={{ ...styles.dropdown, right: 0, width: '250px' }}>
              <p style={styles.dropdownTitle}>Settings</p>
              <p style={styles.settingsLabel}>Push notifications</p>
              <p style={styles.settingsHint}>
                Get an alert on this device when there's a new message, even when the platform is closed.
              </p>
              <button
                style={{ ...styles.enableBtn, opacity: pushBusy || perm === 'granted' ? 0.6 : 1 }}
                onClick={handleEnablePush}
                disabled={pushBusy || perm === 'granted'}
              >
                {pushButtonLabel}
              </button>
              {pushMsg && <p style={styles.pushMsg}>{pushMsg}</p>}
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
  msgBadge: {
    position: 'absolute',
    top: '2px',
    right: '2px',
    minWidth: '15px',
    height: '15px',
    padding: '0 4px',
    borderRadius: '8px',
    background: '#C9A84C',
    color: '#0A0A0A',
    fontSize: '9px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid #0f0f0f',
    pointerEvents: 'none',
    fontFamily: 'Montserrat, sans-serif',
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
    width: '260px',
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
  notifList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '320px',
    overflowY: 'auto',
    margin: '0 -8px',
  },
  notifItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '9px 8px',
    borderRadius: '7px',
    fontFamily: 'Montserrat, sans-serif',
  },
  notifLine: {
    fontSize: '13px',
    color: '#ccc',
    lineHeight: 1.4,
  },
  notifSub: {
    fontSize: '11px',
    color: '#777',
  },
  settingsLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#fff',
    fontFamily: 'Montserrat, sans-serif',
    marginBottom: '4px',
  },
  settingsHint: {
    fontSize: '11px',
    color: '#888',
    lineHeight: 1.5,
    marginBottom: '12px',
    fontFamily: 'Montserrat, sans-serif',
  },
  enableBtn: {
    width: '100%',
    padding: '10px',
    background: '#C9A84C',
    color: '#0A0A0A',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.5px',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'Montserrat, sans-serif',
  },
  pushMsg: {
    fontSize: '11px',
    color: '#aaa',
    lineHeight: 1.5,
    marginTop: '10px',
    fontFamily: 'Montserrat, sans-serif',
  },
}
