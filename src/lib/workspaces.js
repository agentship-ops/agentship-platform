// The three workspaces a person can be in. Every view id that starts with
// "leader:" belongs to the Leader Portal and every one that starts with "hq:"
// belongs to Headquarters; everything else is the Agent Platform.
//
// Access comes from two switches on the person's profile row
// (leader_portal_access and hq_access). Only an admin or the Supabase
// dashboard can turn them on; the profile guard trigger blocks everyone else.

export const WORKSPACES = [
  {
    id: 'platform',
    label: 'Agent Platform',
    sub: 'Leaderboard, community, tools',
    icon: 'ti-users',
    home: 'leaderboard',
  },
  {
    id: 'leader',
    label: 'Leader Portal',
    sub: 'My Agents, recruiting, Leader Library',
    icon: 'ti-star',
    home: 'leader:home',
    flag: 'leader_portal_access',
  },
  {
    id: 'hq',
    label: 'Headquarters',
    sub: 'Company and location P&Ls, distributions',
    icon: 'ti-building-bank',
    home: 'hq:overview',
    flag: 'hq_access',
  },
]

export function workspaceOf(view) {
  if (typeof view !== 'string') return 'platform'
  if (view.startsWith('leader:')) return 'leader'
  if (view.startsWith('hq:')) return 'hq'
  return 'platform'
}

export function canOpen(profile, workspaceId) {
  const ws = WORKSPACES.find(w => w.id === workspaceId)
  if (!ws) return false
  if (!ws.flag) return true
  return profile?.[ws.flag] === true
}

// The account menu only shows a Workspace section when this has 2 or more.
export function workspacesFor(profile) {
  return WORKSPACES.filter(w => canOpen(profile, w.id))
}

// Recruiting Win the Day lives on Leader Home, not in the sidebar.
export const LEADER_NAV = [
  { id: 'leader:home', label: 'Leader Home', icon: 'ti-home' },
  { id: 'leader:ask', label: 'Ask Agentship', icon: 'ti-sparkles' },
  { id: 'leader:myagents', label: 'My Agents', icon: 'ti-users-group' },
  { id: 'leader:recruits', label: 'My Recruits', icon: 'ti-user-plus' },
  { id: 'leader:pl', label: 'P&L', icon: 'ti-report-money' },
  { id: 'leader:library', label: 'Resource Library', icon: 'ti-folder' },
]

// An item with a "section" starts a new labeled group in the sidebar.
export const HQ_NAV = [
  { id: 'hq:overview', label: 'Overview', icon: 'ti-layout-dashboard', section: 'Company' },
  { id: 'hq:pl', label: 'P&L', icon: 'ti-report-money' },
  { id: 'hq:budget', label: 'Budget vs. Actual', icon: 'ti-target' },
  { id: 'hq:distributions', label: 'Distributions', icon: 'ti-building-bank' },
  { id: 'hq:closings', label: 'Closings', icon: 'ti-key' },
  { id: 'hq:pending', label: 'Pending', icon: 'ti-clock' },
  { id: 'hq:agents', label: 'Agent Performance', icon: 'ti-chart-line' },
  { id: 'hq:cap', label: 'Cap Tracker', icon: 'ti-receipt' },
  { id: 'hq:vendors', label: 'Vendor Tracker', icon: 'ti-address-book' },
  { id: 'hq:inbox', label: 'DA Inbox', icon: 'ti-inbox', section: 'Needs Attention' },
  { id: 'hq:missing', label: 'Missing Info', icon: 'ti-alert-triangle' },
]
