import { useState, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../../supabase'

const NAV = [
  {
    type: 'standalone',
    id: 'leaderboard',
    label: 'Leaderboard',
    icon: 'ti-trophy',
  },
  {
    type: 'section',
    id: 'tools',
    label: 'My Tools',
    icon: 'ti-layout-grid',
    defaultOpen: true,
    items: [
      { id: 'command', label: 'Command Center', icon: 'ti-layout-dashboard' },
      { id: 'atlas', label: 'Atlas', icon: 'ti-robot' },
      { id: 'goal', label: 'Goal Tracker', icon: 'ti-chart-bar' },
      { id: 'pl', label: 'P&L', icon: 'ti-cash' },
    ],
  },
  {
    type: 'section',
    id: 'community',
    label: 'Community',
    icon: 'ti-users',
    defaultOpen: true,
    items: [
      { id: 'welcome', label: 'Welcome', icon: 'ti-user-plus' },
      { id: 'updates', label: 'Updates', icon: 'ti-speakerphone' },
      { id: 'events', label: 'Events', icon: 'ti-calendar' },
      { id: 'celebrate', label: 'Celebrate', icon: 'ti-confetti' },
      { id: 'referrals', label: 'Referrals', icon: 'ti-arrows-right-left' },
    ],
  },
  {
    type: 'section',
    id: 'channels',
    label: 'Channels',
    icon: 'ti-messages',
    defaultOpen: true,
    items: [
      { id: 'ch-agentship', label: '# Agentship', icon: 'ti-message-circle', badge: 3 },
      { id: 'ch-westcobb', label: '# West Cobb', icon: 'ti-message-circle' },
    ],
  },
  {
    type: 'section',
    id: 'training',
    label: 'Training',
    icon: 'ti-map',
    defaultOpen: true,
    items: [
      { id: 'mastery', label: 'Platform Road to Mastery', icon: 'ti-map' },
    ],
  },
  {
    type: 'section',
    id: 'trainlib',
    label: 'Training Library',
    icon: 'ti-video',
    defaultOpen: false,
    items: [
      { id: 'tlib-1', label: 'Winning in Real Estate', icon: 'ti-player-play' },
      { id: 'tlib-2', label: 'Time Blocking & Scheduling', icon: 'ti-player-play' },
      { id: 'tlib-3', label: 'Language of Sales', icon: 'ti-player-play' },
      { id: 'tlib-4', label: 'Buyer Outbound', icon: 'ti-player-play' },
      { id: 'tlib-5', label: 'Follow Up Boss Basics', icon: 'ti-player-play' },
    ],
  },
  {
    type: 'section',
    id: 'reslib',
    label: 'Resource Library',
    icon: 'ti-folder',
    defaultOpen: false,
    items: [
      { id: 'res-vendors', label: 'Preferred Vendors', icon: 'ti-users' },
      { id: 'res-audible', label: 'Audible', icon: 'ti-headphones' },
      { id: 'res-winday', label: 'Win the Day Sheets', icon: 'ti-sun' },
      { id: 'res-scripts', label: 'Scripts', icon: 'ti-file-text' },
    ],
  },
]

export default function Sidebar({ open, activeView, setActiveView }) {
  const { profile, signOut } = useAuth()
  const [openSections, setOpenSections] = useState(() => {
    const defaults = {}
    NAV.forEach(n => { if (n.type === 'section') defaults[n.id] = n.defaultOpen })
    return defaults
  })

  const initials = profile
    ? `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`
    : '?'

  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null)

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })
    if (!uploadError) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
      setAvatarUrl(publicUrl)
    }
    setUploading(false)
  }

  function toggleSection(id) {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <aside style={{
      ...styles.sidebar,
      width: open ? '260px' : '0px',
      minWidth: open ? '260px' : '0px',
      overflow: 'hidden',
      transition: 'width 0.2s ease, min-width 0.2s ease',
    }}>
      <nav style={styles.nav}>
        {NAV.map(node => {
          if (node.type === 'standalone') {
            const active = activeView === node.id
            return (
              <button
                key={node.id}
                onClick={() => setActiveView(node.id)}
                style={{
                  ...styles.standalone,
                  ...(active ? styles.standaloneActive : {}),
                }}
              >
                <i className={`ti ${node.icon}`} aria-hidden="true" style={{ fontSize: '18px', color: active ? '#C9A84C' : '#C9A84C', flexShrink: 0 }} />
                <span style={{ color: active ? '#C9A84C' : '#C9A84C' }}>{node.label}</span>
              </button>
            )
          }

          if (node.type === 'section') {
            const isOpen = openSections[node.id]
            return (
              <div key={node.id} style={{ marginBottom: '2px' }}>
                <button
                  onClick={() => toggleSection(node.id)}
                  style={styles.sectionHeader}
                >
                  <i className={`ti ${node.icon}`} aria-hidden="true" style={{ fontSize: '18px', color: '#C9A84C', flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: 'left', color: '#ffffff' }}>{node.label}</span>
                  <i
                    className="ti ti-chevron-down"
                    aria-hidden="true"
                    style={{
                      fontSize: '14px',
                      color: '#aaaaaa',
                      flexShrink: 0,
                      transition: 'transform 0.2s',
                      transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                    }}
                  />
                </button>
                {isOpen && (
                  <div style={styles.subItems}>
                    {node.items.map(item => {
                      const active = activeView === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveView(item.id)}
                          style={{
                            ...styles.navItem,
                            ...(active ? styles.navItemActive : {}),
                          }}
                        >
                          <i className={`ti ${item.icon}`} aria-hidden="true" style={{ fontSize: '17px', color: '#aaaaaa', flexShrink: 0 }} />
                          <span style={{ color: '#ffffff' }}>{item.label}</span>
                          {item.badge && (
                            <span style={styles.badge}>{item.badge}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }
          return null
        })}
      </nav>

      <div style={styles.footer}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleAvatarUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          aria-label="Upload profile photo"
          title="Click to upload photo"
          style={styles.avatarBtn}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile" style={styles.avatarImg} />
          ) : (
            <span>{uploading ? '...' : initials}</span>
          )}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#ffffff' }}>
            {profile ? `${profile.first_name} ${profile.last_name}` : 'Agent'}
          </div>
          <div style={{ fontSize: '11px', color: '#777777', marginTop: '1px' }}>
            {profile?.title || 'Professional'}
          </div>
        </div>
        <button onClick={signOut} aria-label="Sign out" style={styles.signOutBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </aside>
  )
}

const styles = {
  sidebar: {
    background: '#0f0f0f',
    borderRight: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
  },
  nav: {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 12px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  standalone: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: '8px',
    background: 'transparent',
    border: '0.5px solid transparent',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    textAlign: 'left',
    marginBottom: '6px',
    fontFamily: 'Montserrat, sans-serif',
    whiteSpace: 'nowrap',
    color: '#ffffff',
  },
  standaloneActive: {
    background: 'rgba(201,168,76,0.15)',
    border: '0.5px solid rgba(201,168,76,0.35)',
  },
  sectionHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: '8px',
    background: 'transparent',
    border: 'none',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'Montserrat, sans-serif',
    whiteSpace: 'nowrap',
    color: '#ffffff',
  },
  subItems: {
    paddingLeft: '14px',
    borderLeft: '1px solid #2a2a2a',
    marginLeft: '23px',
    marginTop: '2px',
    marginBottom: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  navItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '11px',
    padding: '11px 12px',
    borderRadius: '7px',
    background: 'transparent',
    border: 'none',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'Montserrat, sans-serif',
    whiteSpace: 'nowrap',
    marginBottom: '1px',
    color: '#ffffff',
  },
  navItemActive: {
    background: '#1E1E1E',
  },
  badge: {
    background: '#C9A84C',
    color: '#0A0A0A',
    fontSize: '9px',
    fontWeight: '700',
    padding: '2px 7px',
    borderRadius: '8px',
    marginLeft: 'auto',
  },
  footer: {
    padding: '14px 16px',
    borderTop: '1px solid #2a2a2a',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
  },
  avatarBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    background: '#C9A84C',
    color: '#0A0A0A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: '700',
    flexShrink: 0,
    border: 'none',
    cursor: 'pointer',
    overflow: 'hidden',
    padding: 0,
  },
  avatarImg: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
  },
  signOutBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    background: 'transparent',
    border: 'none',
    color: '#777777',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '17px',
    fontFamily: 'Montserrat, sans-serif',
  },
}

