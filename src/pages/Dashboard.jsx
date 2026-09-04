import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import TopBar from '../components/TopBar'
import Sidebar from '../components/Sidebar'
import Leaderboard from '../components/Leaderboard'
import ComingSoon from '../components/ComingSoon'
import TrainingDetail from '../components/TrainingDetail'
import Channels from '../components/Channels'
import Messages from '../components/Messages'
import Settings from '../components/Settings'
import Directory from '../components/Directory'
import Events from '../components/Events'
import PostFeed from '../components/PostFeed'
import WelcomeSplash from '../components/WelcomeSplash'
import ResourceWinTheDay from '../components/ResourceWinTheDay'

const VIEWS = {
  leaderboard: <Leaderboard />,
  directory: <Directory />,
  command: <ComingSoon title="Command Center" icon="ti-layout-dashboard" description="Your leads, calling queue, and pipeline. This is where you win the day." phase="Phase 2" />,
  atlas: <ComingSoon title="Atlas" icon="ti-robot" description="Your AI teammate. Update leads, log notes, and move deals forward — here or by text from the field." phase="Phase 2" />,
  goal: <ComingSoon title="Goal Tracker" icon="ti-chart-bar" description="Your goals vs actual activity. See where you're on track and where to push." phase="Phase 2" />,
  pl: <ComingSoon title="P&L" icon="ti-cash" description="Your income, expenses, and what you're actually keeping." phase="Phase 2" />,
  welcome: <ComingSoon title="Welcome" icon="ti-user-plus" description="Welcome new agents and make posts for the team to see." phase="Phase 2" />,
  updates: <ComingSoon title="Updates" icon="ti-speakerphone" description="Leader announcements and team updates — post-based space." phase="Phase 2" />,
  events: <Events />,
  bullpen: <PostFeed space="bullpen" />,
  celebrate: <ComingSoon title="Celebrate" icon="ti-confetti" description="Post wins, milestones, and shoutouts. Anyone on the team can post." phase="Phase 2" />,
  referrals: <PostFeed space="referrals" />,
  'ch-agentship': <Channels />,
  'ch-westcobb': <ComingSoon title="# West Cobb" icon="ti-message-circle" description="Channel for the West Cobb market. Built out in Phase 2." phase="Phase 2" />,
  mastery: <TrainingDetail slug="mastery" />,
  'tlib-1': <TrainingDetail slug="tlib-1" />,
  'tlib-2': <TrainingDetail slug="tlib-2" />,
  'tlib-3': <TrainingDetail slug="tlib-3" />,
  'tlib-4': <TrainingDetail slug="tlib-4" />,
  'tlib-6': <TrainingDetail slug="tlib-6" />,
  'res-vendors': <ComingSoon title="Preferred Vendors" icon="ti-users" description="Opens as a PDF or Google Doc. Built out in Phase 3." phase="Phase 3" />,
  'res-audible': <ComingSoon title="Audible" icon="ti-headphones" description="External link. Built out in Phase 3." phase="Phase 3" />,
  'res-winday': <ResourceWinTheDay />,
  'res-scripts': <ComingSoon title="Scripts" icon="ti-file-text" description="Opens as a Google Doc. Built out in Phase 3." phase="Phase 3" />,
}

// Each account-menu item is its own view id, so the browser-agnostic
// activeView string still says exactly where you are.
const SETTINGS_SECTIONS = {
  'settings-profile': 'profile',
  'settings-account': 'account',
  'settings-notifications': 'notifications',
  settings: 'profile', // safety net for any older link
}

export default function Dashboard() {
  const { user, loading } = useAuth()
  const [activeView, setActiveView] = useState('leaderboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [dmUnread, setDmUnread] = useState(0)

  // DM unread count, kept live so the message icon badge is accurate
  // even when the Messages view isn't open.
  const loadDmUnread = useCallback(async () => {
    if (!user) return
    const me = user.id
    const { data: convs } = await supabase
      .from('dm_conversations')
      .select('id, last_message_at')
    if (!convs || !convs.length) { setDmUnread(0); return }

    const ids = convs.map(c => c.id)
    const { data: reads } = await supabase
      .from('dm_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', me)
    const readMap = {}
    ;(reads || []).forEach(r => { readMap[r.conversation_id] = r.last_read_at })

    const { data: recent } = await supabase
      .from('dm_messages')
      .select('conversation_id, user_id, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(400)
    const latest = {}
    ;(recent || []).forEach(m => { if (!latest[m.conversation_id]) latest[m.conversation_id] = m })

    let count = 0
    convs.forEach(c => {
      const last = latest[c.id]
      const lastRead = readMap[c.id]
      if (last && last.user_id !== me && (!lastRead || new Date(last.created_at) > new Date(lastRead))) count++
    })
    setDmUnread(count)
  }, [user])

  useEffect(() => {
    loadDmUnread()
    if (!user) return
    const ch = supabase
      .channel('rt-dm-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, loadDmUnread)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_conversations' }, loadDmUnread)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadDmUnread, user])

  if (loading) return (
    <div style={styles.loading}>
      <div style={styles.loadingDot} />
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  return (
    <div style={styles.app}>
      <WelcomeSplash />
      <div style={styles.column}>
        <TopBar
          onToggleSidebar={() => setSidebarOpen(o => !o)}
          onNavigate={setActiveView}
          dmUnread={dmUnread}
          activeView={activeView}
        />
        <div style={styles.body}>
          <Sidebar
            open={sidebarOpen}
            activeView={activeView}
            setActiveView={setActiveView}
          />
          <main style={styles.main}>
            {activeView === 'messages' ? (
              <Messages onUnreadChange={setDmUnread} />
            ) : SETTINGS_SECTIONS[activeView] ? (
              // The account menu points straight at a section, so Settings
              // opens on the right tab instead of always landing on Profile.
              <Settings
                section={SETTINGS_SECTIONS[activeView]}
                onSectionChange={setActiveView}
              />
            ) : (
              VIEWS[activeView] ?? <Leaderboard />
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

const styles = {
  app: {
    height: '100vh',
    background: '#0A0A0A',
    display: 'flex',
  },
  column: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    overflowY: 'auto',
    background: '#0A0A0A',
  },
  loading: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0A0A0A',
  },
  loadingDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#C9A84C',
  },
}
