// Leader Portal pages. Shells for now: each page is a placeholder until it is
// built, except My Agents, which moved here from the Agent Platform sidebar.
import ComingSoon from '../ComingSoon'
import MyAgents from '../myBusiness/MyAgents'

const PAGES = {
  'leader:home': { title: 'Leader Home', icon: 'ti-home', description: 'Everything for leading your agents and growing your group, in one place.' },
  'leader:recruits': { title: 'My Recruits', icon: 'ti-user-plus', description: "Everyone you're talking to, where they are in the process, and what's next." },
  'leader:winday': { title: 'Recruiting Win the Day', icon: 'ti-sun', description: 'Daily recruiting activity alongside your own business. Built once the recruiting framework is final.' },
  'leader:library': { title: 'Leader Library', icon: 'ti-folder', description: "Agreements, DISC and KPA, facilitator's guides and hiring playbooks, opening live from Google Drive." },
  'leader:ask': { title: 'Ask Agentship for Leaders', icon: 'ti-sparkles', description: 'Coaching answers grounded in your agents\u2019 profiles and Kalie\u2019s frameworks.' },
}

export default function LeaderPortal({ view, isLeader }) {
  if (view === 'leader:myagents') {
    // My Agents reads plan data that the database only shares with leader
    // and admin accounts, so other accounts get a placeholder instead of an
    // empty roster.
    if (isLeader) return <MyAgents />
    return <ComingSoon title="My Agents" icon="ti-users-group" description="Your agents' plans and pace. Opens once your account is set up to see agent plans." phase="Coming Soon" />
  }
  const page = PAGES[view] || PAGES['leader:home']
  return <ComingSoon title={page.title} icon={page.icon} description={page.description} phase="Coming Soon" />
}
