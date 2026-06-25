import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import TopBar from '../components/TopBar'
import Sidebar from '../components/Sidebar'
import Leaderboard from '../components/Leaderboard'
import ComingSoon from '../components/ComingSoon'

const VIEWS = {
  leaderboard: <Leaderboard />,
  command: <ComingSoon title="Command Center" icon="ti-layout-dashboard" description="Your leads, calling queue, and pipeline. This is where you win the day." phase="Phase 2" />,
  atlas: <ComingSoon title="Atlas" icon="ti-robot" description="Your AI teammate. Update leads, log notes, and move deals forward — here or by text from the field." phase="Phase 2" />,
  goal: <ComingSoon title="Goal Tracker" icon="ti-chart-bar" description="Your goals vs actual activity. See where you're on track and where to push." phase="Phase 2" />,
  pl: <ComingSoon title="P&L" icon="ti-cash" description="Your income, expenses, and what you're actually keeping." phase="Phase 2" />,
  welcome: <ComingSoon title="Welcome" icon="ti-user-plus" description="Welcome new agents and make posts for the team to see." phase="Phase 2" />,
  updates: <ComingSoon title="Updates" icon="ti-speakerphone" description="Leader announcements and team updates — post-based space." phase="Phase 2" />,
  events: <ComingSoon title="Events" icon="ti-calendar" description="Calendar view. Leaders create events, agents see and RSVP." phase="Phase 2" />,
  celebrate: <ComingSoon title="Celebrate" icon="ti-confetti" description="Post wins, milestones, and shoutouts. Anyone on the team can post." phase="Phase 2" />,
  referrals: <ComingSoon title="Referrals" icon="ti-arrows-right-left" description="Post and claim referral opportunities — post-based space." phase="Phase 2" />,
  'ch-agentship': <ComingSoon title="# Agentship" icon="ti-message-circle" description="Team-wide channel. Built out in Phase 2." phase="Phase 2" />,
  'ch-westcobb': <ComingSoon title="# West Cobb" icon="ti-message-circle" description="Channel for the West Cobb market. Built out in Phase 2." phase="Phase 2" />,
  mastery: <ComingSoon title="Platform Road to Mastery" icon="ti-map" description="Sequential onboarding course for new agents." phase="Phase 3" />,
  'tlib-1': <ComingSoon title="Winning in Real Estate" icon="ti-player-play" description="Training video. Built out in Phase 3." phase="Phase 3" />,
  'tlib-2': <ComingSoon title="Time Blocking & Scheduling" icon="ti-player-play" description="Training video. Built out in Phase 3." phase="Phase 3" />,
  'tlib-3': <ComingSoon title="Language of Sales" icon="ti-player-play" description="Training video. Built out in Phase 3." phase="Phase 3" />,
  'tlib-4': <ComingSoon title="Buyer Outbound" icon="ti-player-play" description="Training video. Built out in Phase 3." phase="Phase 3" />,
  'tlib-5': <ComingSoon title="Follow Up Boss Basics" icon="ti-player-play" description="Training video. Built out in Phase 3." phase="Phase 3" />,
  'res-vendors': <ComingSoon title="Preferred Vendors" icon="ti-users" description="Opens as a PDF or Google Doc. Built out in Phase 3." phase="Phase 3" />,
  'res-audible': <ComingSoon title="Audible" icon="ti-headphones" description="External link. Built out in Phase 3." phase="Phase 3" />,
  'res-winday': <ComingSoon title="Win the Day Sheets" icon="ti-sun" description="Opens as a PDF. Built out in Phase 3." phase="Phase 3" />,
  'res-scripts': <ComingSoon title="Scripts" icon="ti-file-text" description="Opens as a Google Doc. Built out in Phase 3." phase="Phase 3" />,
}

export default function Dashboard() {
  const { user, loading } = useAuth()
  const [activeView, setActiveView] = useState('leaderboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  if (loading) return (
    <div style={styles.loading}>
      <div style={styles.loadingDot} />
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  return (
    <div style={styles.app}>
      <div style={styles.column}>
        <TopBar onToggleSidebar={() => setSidebarOpen(o => !o)} />
        <div style={styles.body}>
          <Sidebar
            open={sidebarOpen}
            activeView={activeView}
            setActiveView={setActiveView}
          />
          <main style={styles.main}>
            {VIEWS[activeView] ?? <Leaderboard />}
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
