// My Business: every number on every tab comes from here, so the agent's
// screens, the leader view, the shared goals row, and the PDF always agree.
// Ported from the approved prototype's calc, dealCalc, plSum, paceData,
// rowVal, and nwTot. Deals and activity come from Follow Up Boss
// (leaderboard_deals); nurtures are the only activity an agent types in.

export const ROYALTY = 3000
export const ZILLOW_FEE = 0.40
export const SPLITS = { program: { nz: 0.50, z: 0.50 }, collective: { nz: 0.70, z: 0.65 } }
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const CLARITY = [
  'I track my net worth every month and know it down to the dollar.',
  'I follow a written budget and update it weekly.',
  'I am clear on my monthly expenses, both personally and professionally.',
  "I am living free of consumer debt and don't carry balances on credit cards.",
  'I regularly re-marginalize my expenses, personally and professionally, to avoid expense creep.',
  'I am clear on my reserve goals and am actively working toward them or have already met them.',
  'I have adequate protection for myself and my family should something happen to me.',
]
export const PROTECTION = [['health', 'Health insurance'], ['life', 'Life insurance'], ['disability', 'Disability insurance'], ['estate', 'Trust, estate plan, or will']]
export const LBD = [
  ['trips', 'Where do you want to visit or vacation?', 'Trip'],
  ['milestones', 'What milestone celebrations will happen this year?', 'Graduation, wedding, birthday'],
  ['growth', 'What personal growth will you invest in?', 'Course, retreat, program'],
  ['purchases', 'What big purchases will you make?', 'Car, appliance, boat'],
  ['savings', 'How much will you save or invest, and where?', 'Emergency fund, retirement'],
  ['subs', 'What subscriptions do you pay for? (annual cost)', 'Streaming, apps, memberships'],
]
export const COL_DEFAULT = [
  ['Mortgage or Rent', 'mo'], ['Property Taxes (If Not in Mortgage)', 'yr'], ['Homeowners Insurance (If Not in Mortgage)', 'yr'],
  ['Home Operating: Energy, Cleaning, Maintenance', 'mo'], ['Health Insurance', 'mo'], ['Auto Insurance', 'mo'], ['Auto Payments', 'mo'],
  ['Tuition', 'mo'], ['Daycare or Childcare', 'mo'], ['Income Taxes', 'mo'], ['Credit Card Payments', 'mo'], ['Loan Payments', 'mo'],
  ['Groceries', 'mo'], ['Child Support or Alimony', 'mo'],
  ['Clothing and Personal Care', 'mo'], ['Gas', 'mo'], ['Entertainment and Eating Out', 'mo'], ['Other', 'mo'],
]
export const BIZ_DEFAULT = [
  ['Marketing and Advertising', 'mo'], ['Lead Generation (Not Zillow)', 'mo'], ['MLS and Board Dues', 'yr'],
  ['License Renewal and Continuing Education', 'yr'], ['E&O Insurance', 'yr'], ['CRM, Apps, and Technology', 'mo'],
  ['Coaching, Conferences, and Education', 'mo'], ['Photography, Video, and Staging', 'mo'], ['Signs, Lockboxes, and Supplies', 'yr'],
  ['Client and Closing Gifts', 'mo'], ['Business Vehicle, Gas, and Mileage', 'mo'], ['Phone and Internet', 'mo'],
  ['Business Meals', 'mo'], ['Assistant or Team Support', 'mo'], ['Other', 'mo'],
]
export const FUNNEL = [
  ['nurture', 'Nurtures', 'Nurtures to Appointments Set', 25],
  ['set', 'Appointments Set', 'Appointments Set to Gone On', 50],
  ['met', 'Appointments Gone On', 'Appointments Gone On to Clients', 50],
  ['clients', 'Clients Taken', 'Clients to Under Contract', 75],
  ['uc', 'Under Contract', 'Under Contract to Closed', 90],
]
export const STD_FUNNEL = { uc: 90, clients: 75, met: 50, set: 50, nurture: 25 }
export const ACT = [['nurture', 'Nurtures'], ['set', 'Appointments Set'], ['met', 'Appointments Gone On'], ['clients', 'Clients Taken'], ['uc', 'Under Contract'], ['closed', 'Closings']]
export const STEPS = ['Start', 'Financial Clarity', 'Net Worth', 'Life by Design', 'Cost of Living', 'Business Expenses', 'Your Business', 'Your Activity', 'Accountability', 'Your Plan']
export const STAGES = [['nurture', 'set', 'Nurtures to Appointments Set'], ['set', 'met', 'Appointments Set to Gone On'], ['met', 'clients', 'Appointments Gone On to Clients'], ['clients', 'uc', 'Clients to Under Contract'], ['uc', 'closed', 'Under Contract to Closed']]
export const TRAJ = [['nurture', 'Nurtures'], ['set', 'Appointments Set'], ['met', 'Appointments Gone On'], ['clients', 'Clients Taken'], ['uc', 'Under Contract']]
// Goal-setting steps lock once the plan is locked in; tracking never locks.
export const LOCKED_STEPS = [0, 3, 4, 5, 6, 7, 8]
export const PLAN_KEYS = ['profile', 'lbd', 'col', 'bizExp', 'biz', 'funnel', 'acc']

export const laneName = d => (d === 'program' ? 'Agentship Program' : 'Agentship Collective')

/* ---------- helpers ---------- */
export const uid = () => Math.random().toString(36).slice(2, 9)
export const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n }
export const $f = n => (n < -0.5 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US')
export const $neg = n => (n > 0.5 ? '(' + $f(n) + ')' : '$0')
export const R = n => Math.round(n)
export const U = n => Math.ceil(n - 1e-9)
export const filled = x => x !== undefined && x !== null && String(x).trim() !== ''
export const budgetMo = r => (r.f === 'yr' ? num(r.v) / 12 : num(r.v))
export const budgetYr = r => (r.f === 'yr' ? num(r.v) : num(r.v) * 12)
export const clone = o => JSON.parse(JSON.stringify(o))

export function pathGet(obj, p) { return p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj) }
export function pathSet(obj, p, val) {
  const ks = p.split('.'); let o = obj
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]] }
  o[ks[ks.length - 1]] = val
}

/* ---------- defaults ---------- */
const mk = l => ({ l, v: {} })
export function nwDefaults() {
  return {
    personal: {
      assets: ['Savings', 'Checking', 'Cash', 'Investments and Retirement', 'Home Value', 'Vehicle Value'].map(mk),
      debts: ['Mortgage Balance', 'Auto Loans', 'Credit Cards', 'Student Loans', 'Medical Bills'].map(mk),
    },
    business: {
      assets: ['Business Checking', 'Business Savings', 'Equipment and Technology', 'Business Vehicle'].map(mk),
      debts: ['Business Credit Cards', 'Business Loans', 'Equipment Financing'].map(mk),
    },
  }
}
export const bizDefaults = () => BIZ_DEFAULT.map(([l, f]) => ({ id: uid(), l, v: '', f }))
const blankRows = (n, shape) => Array.from({ length: n }, () => ({ ...shape }))

export function defaults(name = '') {
  const lbd = {}; LBD.forEach(([k]) => { lbd[k] = blankRows(2, { d: '', t: '', c: '' }) })
  return {
    v: 1, step: 0,
    profile: { name, division: 'collective' },
    clarity: [0, 0, 0, 0, 0, 0, 0], protection: {},
    nw: nwDefaults(),
    lbd, col: COL_DEFAULT.map(([l, f]) => ({ l, v: '', f })),
    bizExp: bizDefaults(),
    biz: { price: '', rate: '', zillow: 50, cap: '' },
    funnel: { ...STD_FUNNEL },
    acc: { self: '', leader: '' },
    pace: { months: {} },
    pl: { months: {} },
    prevYear: null, funnelFrom: null,
    editing: null,
  }
}

/* ---------- net worth ---------- */
export function rowVal(r, p) {
  if (p !== 'start') for (let i = p; i >= 0; i--) if (filled(r.v[i])) return num(r.v[i])
  return num(r.v.start)
}
export function nwTot(data, g, p) {
  const G = data.nw[g]
  const a = G.assets.reduce((s, r) => s + rowVal(r, p), 0), d = G.debts.reduce((s, r) => s + rowVal(r, p), 0)
  return { a, d, nw: a - d }
}
export function lastMonth(data, g) {
  const G = data.nw[g]; let last = -1
  ;[...G.assets, ...G.debts].forEach(r => { for (let i = 0; i < 12; i++) if (filled(r.v[i]) && i > last) last = i })
  return last
}

/* ---------- plan math ---------- */
export function calc(data) {
  const a = LBD.reduce((s, [k]) => s + (data.lbd[k] || []).reduce((t, r) => t + num(r.c), 0), 0)
  const monthly = data.col.reduce((s, r) => s + (r.f === 'yr' ? num(r.v) / 12 : num(r.v)), 0)
  const c = monthly * 12
  const income = a + c
  const bizYr = data.bizExp.reduce((s, r) => s + budgetYr(r), 0)
  const cap = num(data.biz.cap), kw = ROYALTY + cap
  const price = num(data.biz.price), rate = num(data.biz.rate)
  const gci = price * rate / 100
  const sp = SPLITS[data.profile.division] || SPLITS.collective
  const netNZ = gci * sp.nz, netZ = gci * (1 - ZILLOW_FEE) * sp.z
  const zp = Math.min(100, Math.max(0, num(data.biz.zillow))) / 100
  const blended = (1 - zp) * netNZ + zp * netZ
  const need = income + bizYr + kw
  const tx = blended > 0 && income > 0 ? Math.ceil(need / blended - 1e-9) : 0
  const breakEven = blended > 0 && (c + bizYr) > 0 ? Math.ceil((c + bizYr + kw) / blended - 1e-9) : 0
  const f = data.funnel, chain = { closed: tx }
  chain.uc = tx / (num(f.uc) / 100 || 1)
  chain.clients = chain.uc / (num(f.clients) / 100 || 1)
  chain.met = chain.clients / (num(f.met) / 100 || 1)
  chain.set = chain.met / (num(f.set) / 100 || 1)
  chain.nurture = chain.set / (num(f.nurture) / 100 || 1)
  const rated = data.clarity.filter(x => x > 0).length
  const score = rated ? Math.round(data.clarity.reduce((s, x) => s + x, 0) / 35 * 100) : null
  const plan = { gci: tx * gci, zfee: tx * zp * gci * ZILLOW_FEE, take: tx * blended }
  plan.split = plan.gci - plan.zfee - plan.take; plan.kw = kw; plan.exp = bizYr; plan.net = plan.take - kw - bizYr
  return {
    a, monthly, c, income, bizYr, cap, kw, price, rate, gci, netNZ, netZ, zp, blended, need, tx, breakEven, chain, score, sp, plan,
    pS: nwTot(data, 'personal', 'start'), bS: nwTot(data, 'business', 'start'), volume: tx * price,
  }
}

/* ---------- Follow Up Boss actuals ---------- */
// One closed deal. total = the deal's total commission in FUB.
export function dealCalc(deal, division) {
  const sp = SPLITS[division] || SPLITS.collective
  const gci = num(deal.total_commission), z = !!deal.is_zillow
  const zfee = z ? gci * ZILLOW_FEE : 0, take = (gci - zfee) * (z ? sp.z : sp.nz)
  return { gci, zfee, take, split: gci - zfee - take }
}

const monthOf = (d, year) => (d && Number(d.slice(0, 4)) === year ? Number(d.slice(5, 7)) - 1 : null)

// Monthly activity counts and closed deals for one agent's deal rows in one year.
export function fubActuals(deals, year) {
  const months = Array.from({ length: 12 }, () => ({ set: 0, met: 0, clients: 0, uc: 0, closed: 0, deals: [] }))
  ;(deals || []).forEach(d => {
    const add = (field, key) => { const m = monthOf(d[field], year); if (m != null) months[m][key]++ }
    add('appt_set_date', 'set'); add('appt_met_date', 'met'); add('signed_date', 'clients'); add('under_contract_date', 'uc')
    const m = monthOf(d.closed_date, year)
    if (m != null) { months[m].closed++; months[m].deals.push(d) }
  })
  months.forEach(M => M.deals.sort((a, b) => String(a.closed_date).localeCompare(String(b.closed_date))))
  return { year, months }
}

export const nurturesOf = data => Array.from({ length: 12 }, (_, m) => num(((data.pace || {}).months || {})[m]?.nurture))

export function monthActual(key, m, nurtures, act) {
  if (key === 'nurture') return num(nurtures[m])
  return act.months[m][key]
}

export function activityYtd(nurtures, act, thru) {
  const ytd = {}
  ACT.forEach(([a]) => { ytd[a] = 0; for (let i = 0; i <= thru; i++) ytd[a] += monthActual(a, i, nurtures, act) })
  return ytd
}

// Income actuals (deals only): used by the P&L and the leader view.
export function dealSum(act, division, from, to) {
  const o = { gci: 0, zfee: 0, split: 0, take: 0, deals: 0 }
  for (let m = from; m <= to; m++) act.months[m].deals.forEach(d => {
    const c = dealCalc(d, division); o.deals++; o.gci += c.gci; o.zfee += c.zfee; o.split += c.split; o.take += c.take
  })
  return o
}

export function plSum(data, act, from, to) {
  const o = { ...dealSum(act, data.profile.division, from, to), royalty: 0, cap: 0, exp: {}, expTotal: 0 }
  for (let m = from; m <= to; m++) {
    const M = data.pl.months[m]; if (!M) continue
    o.royalty += num(M.royalty); o.cap += num(M.cap)
    data.bizExp.forEach(r => { const v = num((M.exp || {})[r.id]); o.exp[r.id] = (o.exp[r.id] || 0) + v; o.expTotal += v })
  }
  o.net = o.take - o.royalty - o.cap - o.expTotal
  return o
}

export function paceData(data, act, thru) {
  const k = calc(data)
  return { k, ytd: activityYtd(nurturesOf(data), act, thru), frac: (thru + 1) / 12 }
}

// Full-year actual conversion rates, used to prefill next year's plan.
export function actualRates(nurtures, act) {
  const t = activityYtd(nurtures, act, 11)
  const r = (to, from) => (t[from] > 0 && t[to] > 0 ? Math.min(100, Math.round(t[to] / t[from] * 100)) : null)
  return { nurture: r('set', 'nurture'), set: r('met', 'set'), met: r('clients', 'met'), clients: r('uc', 'clients'), uc: r('closed', 'uc') }
}

/* ---------- shared summary (what leaders can see) ---------- */
export function summarize(data) {
  const k = calc(data)
  const targets = {}
  ACT.forEach(([key]) => { const n = k.chain[key] || 0; targets[key] = { annual: R(n), monthly: U(n / 12), weekly: U(n / 52) } })
  return {
    name: data.profile.name || '', division: data.profile.division,
    income: k.income, tx: k.tx, gci: k.plan.gci, volume: k.volume, breakEven: k.breakEven, blended: k.blended,
    plan: k.plan, funnel: { ...data.funnel }, chain: k.chain, targets,
    nurtures: nurturesOf(data),
    acc: { self: data.acc.self || '', leader: data.acc.leader || '' },
  }
}

// While an agent is mid-edit, the shared numbers stay on the locked-in plan.
export function sharedData(data) {
  if (!data.editing || !data.editing.snapshot) return data
  return { ...data, ...data.editing.snapshot }
}

export function goalsRow(userId, year, data, committedAt) {
  const s = summarize(sharedData(data))
  return {
    user_id: userId, plan_year: year, lane: s.division,
    income_goal: R(s.income), transaction_goal: s.tx, gci_goal: R(s.gci), sales_volume_goal: R(s.volume),
    break_even_deals: s.breakEven, take_home_per_deal: R(s.blended),
    summary: s, accountability_self: s.acc.self, accountability_leader: s.acc.leader,
    committed_at: committedAt || null,
  }
}

export const headline = data => { const k = calc(data); return { income: k.income, tx: k.tx, gci: k.plan.gci } }

/* ---------- years ---------- */
// Copy forward into a new year: lane, protection, cost of living, business
// expenses, business inputs, net worth (December's ending values become the
// new starting values), and conversion rates (last year's actual rates where
// both counts are above zero, otherwise last year's planned rate).
export function nextYearData(prev, prevYear, prevAct, fallbackName) {
  const nx = defaults(prev.profile.name || fallbackName || '')
  nx.profile = { name: prev.profile.name || fallbackName || '', division: prev.profile.division }
  nx.protection = { ...prev.protection }
  nx.col = clone(prev.col)
  nx.bizExp = prev.bizExp.map(r => ({ id: uid(), l: r.l, v: r.v, f: r.f }))
  nx.biz = { ...prev.biz }
  ;['personal', 'business'].forEach(g => ['assets', 'debts'].forEach(k => {
    nx.nw[g][k] = prev.nw[g][k].map(r => ({ l: r.l, v: { start: String(R(rowVal(r, 11))) } }))
  }))
  const ar = actualRates(nurturesOf(prev), prevAct); let used = false
  Object.keys(nx.funnel).forEach(k => {
    if (ar[k] != null) { nx.funnel[k] = ar[k]; used = true } else nx.funnel[k] = prev.funnel[k] ?? STD_FUNNEL[k]
  })
  nx.funnelFrom = used ? prevYear : null
  nx.prevYear = prevYear
  return nx
}

// Past years stay editable through January 31 of the following year.
export function yearReadOnly(year, today = new Date(), unlocked = false) {
  if (unlocked) return false
  const cutoff = new Date(year + 1, 0, 31, 23, 59, 59)
  return today > cutoff
}
