// Headquarters pages. Shells for now: each page is a placeholder until it is
// built from DAs, Follow Up Boss and QuickBooks.
import ComingSoon from '../ComingSoon'

const PAGES = {
  'hq:overview': { title: 'Company Overview', icon: 'ti-layout-dashboard', description: 'Revenue, net revenue, expenses, profit and production across every location.' },
  'hq:pl': { title: 'P&L', icon: 'ti-report-money', description: 'The company P&L by month, with a P&L for each location.' },
  'hq:budget': { title: 'Budget vs. Actual', icon: 'ti-target', description: 'This year\u2019s budget against what actually happened, month by month.' },
  'hq:closings': { title: 'Closings', icon: 'ti-key', description: 'Every approved closing and how its commission was split.' },
  'hq:pending': { title: 'Pending', icon: 'ti-clock', description: 'Everything under contract from Follow Up Boss, with projected GCI and close dates.' },
  'hq:agents': { title: 'Agent Performance', icon: 'ti-chart-line', description: 'Units, volume, GCI and contribution to the bottom line by agent.' },
  'hq:distributions': { title: 'Distributions', icon: 'ti-building-bank', description: 'Quarterly profit, leader splits and member distributions.' },
  'hq:cap': { title: 'Cap Tracker', icon: 'ti-receipt', description: 'Cap and royalty paid, and reimbursements owed, by agent.' },
  'hq:vendors': { title: 'Vendor Tracker', icon: 'ti-address-book', description: 'Who closed with which lender and closing attorney, from Follow Up Boss.' },
  'hq:missing': { title: 'Missing Info', icon: 'ti-alert-triangle', description: 'Deals missing something Headquarters needs: lender, attorney, location, lead source, or a DA after closing.' },
  'hq:inbox': { title: 'DA Inbox', icon: 'ti-inbox', description: 'New DAs from the Drive folder, read and matched, waiting for your approval.' },
}

export default function Headquarters({ view }) {
  const page = PAGES[view] || PAGES['hq:overview']
  return <ComingSoon title={page.title} icon={page.icon} description={page.description} phase="Coming Soon" />
}
