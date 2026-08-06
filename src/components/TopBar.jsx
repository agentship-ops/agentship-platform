import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export default function TopBar({ onToggleSidebar }) {
  const [userId, setUserId] = useState(null)
  const [notifs, setNotifs] = useState([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data?.session?.user?.id ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => { sub?.subscription?.unsubscribe() }
  }, [])

  const load = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifs(data || [])
  }, [userId])

  useEffect(() => {
    load()
    if (!userId) return
    const ch = supabase
      .channel('rt-notifs')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, load])

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const unread = notifs.filter(n => !n.read).length

  async function openPanel() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      const ids = notifs.filter(n => !n.read).map(n => n.id)
      setNotifs(prev => prev.map(n => ({ ...n, read: true })))
      await supabase.from('notifications').update({ read: true }).in('id', ids)
    }
  }

  const actorName = (n) =>
    `${n.actor_first || 'Someone'}${n.actor_last ? ' ' + n.actor_last : ''}`

  const timeAgo = (iso) => {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (secs < 60) return 'just now'
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div style={styles.topbar}>
      <button
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        style={styles.hbtn}
      >
        <i className="ti ti-menu-2" aria-hidden="true" />
      </button>

      <div style={styles.brand}>
        <div style={styles.brandMark}>A</div>
        <div style={styles.brandWords}>
          <span style={styles.poweredBy}>Powered by</span>
          <span style={styles.agentship}>Agentship</span>
        </div>
      </div>

      <div style={styles.right}>
        <div style={{ position: 'relative' }} ref={wrapRef}>
          <button aria-label="Notifications" style={styles.iconBtn} onClick={openPanel}>
            <i className="ti ti-bell" aria-hidden="true" />
          </button>
          {unread > 0 && (
            <div style={styles.notifBadge}>{unread > 9 ? '9+' : unread}</div>
          )}

          {open && (
            <div style={styles.panel}>
              <div style={styles.panelHead}>Notifications</div>
              {notifs.length === 0 ? (
                <div style={styles.panelEmpty}>Nothing yet. When someone tags you, it shows up here.</div>
              ) : (
                <div style={styles.panelList}>
                  {notifs.map(n => (
                    <div key={n.id} style={styles.notifRow}>
                      <div style={styles.notifIcon}>
                        <i className="ti ti-at" aria-hidden="true" />
                      </div>
                      <div style={styles.notifBody}>
                        <div style={styles.notifTop}>
                          <strong style={{ color: '#fff' }}>{actorName(n)}</strong>
                          <span style={{ color: '#888' }}> tagged you in #{n.channel}</span>
                        </div>
                        {n.preview && <div style={styles.notifPreview}>{n.preview}</div>}
                        <div style={styles.notifTime}>{timeAgo(n.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <button aria-label="Settings" style={styles.iconBtn}>
          <i className="ti ti-settings" aria-hidden="true" />
        </button>
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
    gap: '16px',
    flexShrink: 0,
  },
  hbtn: {
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
    fontSize: '20px',
    flexShrink: 0,
    fontFamily: 'Montserrat, sans-serif',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
  },
  brandMark: {
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    background: '#C9A84C',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '700',
    color: '#0A0A0A',
    flexShrink: 0,
    fontFamily: 'Montserrat, sans-serif',
  },
  brandWords: {
    display: 'flex',
    flexDirection: 'column',
  },
  poweredBy: {
    fontSize: '9px',
    color: '#888',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    lineHeight: 1.2,
  },
  agentship: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    lineHeight: 1.2,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  iconBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '17px',
    fontFamily: 'Montserrat, sans-serif',
  },
  notifBadge: {
    minWidth: '16px',
    height: '16px',
    padding: '0 4px',
    borderRadius: '8px',
    background: '#C9A84C',
    color: '#0A0A0A',
    fontSize: '9px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position:
