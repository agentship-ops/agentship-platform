// My Business: yearly business plan, goal tracker, agent P&L, net worth, and
// what my leader sees. One page, a year dropdown, five tabs. Saves as you type.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../lib/AuthContext'
import {
  defaults, clone, pathSet, calc, fubActuals, plSum, nwTot, nextYearData, yearReadOnly,
  goalsRow, headline, summarize, sharedData, PLAN_KEYS,
} from '../../lib/myBusiness/calc'
import { loadMyPlans, loadDeals, fubIdMap, savePlan, addRevision } from '../../lib/myBusiness/data'
import { downloadPlan } from '../../lib/myBusiness/pdf'
import PlanSteps from './PlanSteps'
import { GoalTracker, PL, NetWorth } from './Tracking'
import LeaderCard from './LeaderCard'
import './mb.css'

const TABS = [['pace', 'Goal Tracker'], ['pl', 'P&L'], ['nw', 'Net Worth'], ['plan', 'My Plan'], ['leader', 'What My Leader Sees']]

const defaultMonth = (year, now = new Date()) => (year < now.getFullYear() ? 11 : year > now.getFullYear() ? 0 : now.getMonth())

export default function MyBusiness({ initialTab }) {
  const { user, profile } = useAuth()
  const now = new Date()
  const curY = now.getFullYear(), nextY = curY + 1, octOpen = now.getMonth() >= 9
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [plans, setPlans] = useState({})          // year -> { data, committed_at, unlocked, exists }
  const [revisions, setRevisions] = useState([])
  const [deals, setDeals] = useState([])
  const [year, setYear] = useState(curY)
  const [tab, setTab] = useState(initialTab || 'plan')
  const [months, setMonths] = useState({})         // per-year selected months for each tab
  const [saveState, setSaveState] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [dlMsg, setDlMsg] = useState('')

  const plansRef = useRef(plans); plansRef.current = plans
  const dirty = useRef(new Set())
  const timer = useRef(null)
  const topRef = useRef(null)

  /* ---------- load ---------- */
  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      try {
        const [{ plans: rows, revisions: revs }, { map }] = await Promise.all([loadMyPlans(user.id), fubIdMap()])
        let ids = map[user.id] || []
        if (!ids.length && profile?.fub_user_id && !isNaN(parseInt(profile.fub_user_id, 10))) ids = [parseInt(profile.fub_user_id, 10)]
        const dl = await loadDeals(ids)
        if (!alive) return
        const P = {}
        rows.forEach(r => { P[r.plan_year] = { data: { ...defaults(fullName), ...r.data }, committed_at: r.committed_at, unlocked: r.unlocked, exists: true } })
        if (!P[curY]) P[curY] = { data: freshData(P, curY, dl), committed_at: null, unlocked: false, exists: false }
        setPlans(P); setRevisions(revs); setDeals(dl)
        const cur = P[curY]
        if (!initialTab) setTab(!cur.exists || !cur.committed_at ? 'plan' : 'pace')
        setLoading(false)
      } catch (e) {
        if (alive) { setErr(e.message || String(e)); setLoading(false) }
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // A new year copies forward from the latest earlier plan, if there is one.
  function freshData(P, y, dl) {
    const earlier = Object.keys(P).map(Number).filter(v => v < y && P[v].exists).sort((a, b) => b - a)[0]
    if (earlier) return nextYearData(P[earlier].data, earlier, fubActuals(dl, earlier), fullName)
    return defaults(fullName)
  }

  /* ---------- save ---------- */
  const flush = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null
    const years = [...dirty.current]; dirty.current.clear()
    if (!years.length) return
    setSaveState('Saving…')
    try {
      for (const y of years) {
        const e = plansRef.current[y]; if (!e) continue
        await savePlan(user.id, y, e, goalsRow(user.id, y, e.data, e.committed_at))
        if (!e.exists) setPlans(p => ({ ...p, [y]: { ...p[y], exists: true } }))
        plansRef.current = { ...plansRef.current, [y]: { ...plansRef.current[y], exists: true } }
      }
      setSaveState('Saved')
    } catch (e) {
      years.forEach(y => dirty.current.add(y))
      setSaveState("Couldn't save. Retrying when you make your next change.")
    }
  }, [user])

  useEffect(() => () => { if (timer.current) flush() }, [flush])

  const entry = plans[year]
  const data = entry?.data
  const committedAt = entry?.committed_at || null
  const readOnly = entry ? yearReadOnly(year, now, entry.unlocked) : false

  const mutate = useCallback((y, fn, { immediate } = {}) => {
    setPlans(p => {
      const e = p[y]; if (!e) return p
      const nd = clone(e.data); const extra = fn(nd) || {}
      const next = { ...p, [y]: { ...e, data: nd, ...extra } }
      plansRef.current = next
      return next
    })
    dirty.current.add(y)
    setSaveState('Saving…')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, immediate ? 0 : 800)
  }, [flush])

  const update = fn => { if (!readOnly) mutate(year, d => { fn(d) }) }
  const set = (path, v) => update(d => pathSet(d, path, v))

  /* ---------- years ---------- */
  const years = useMemo(() => Object.keys(plans).map(Number).sort((a, b) => a - b), [plans])
  function switchYear(y) {
    if (!plans[y]) setPlans(p => ({ ...p, [y]: { data: freshData(p, y, deals), committed_at: null, unlocked: false, exists: false } }))
    setYear(y)
    topRef.current?.scrollIntoView({ block: 'start' })
  }
  function startNextYear() {
    if (plans[nextY]?.exists) { switchYear(nextY); setTab('plan'); return }
    if (!window.confirm(`Start your ${nextY} plan? Your ${curY} plan stays saved and you can switch back anytime.`)) return
    const nd = freshData(plans, nextY, deals); nd.step = 0
    setPlans(p => { const n = { ...p, [nextY]: { data: nd, committed_at: null, unlocked: false, exists: false } }; plansRef.current = n; return n })
    dirty.current.add(nextY); clearTimeout(timer.current); timer.current = setTimeout(flush, 0)
    setYear(nextY); setTab('plan')
  }

  /* ---------- plan locking ---------- */
  const commit = () => mutate(year, d => { d.step = 9; return { committed_at: new Date().toISOString() } }, { immediate: true })
  function confirmEdit(reason) {
    setEditOpen(false)
    mutate(year, d => {
      const snap = {}; PLAN_KEYS.forEach(k => { snap[k] = clone(d[k]) })
      d.editing = { snapshot: snap, reason, before: headline(d) }
    }, { immediate: true })
  }
  const cancelEdit = () => mutate(year, d => {
    if (d.editing?.snapshot) PLAN_KEYS.forEach(k => { d[k] = d.editing.snapshot[k] })
    d.editing = null
  }, { immediate: true })
  async function saveEdit() {
    const e = data.editing; if (!e) return
    const after = headline(data)
    try {
      const rev = await addRevision(user.id, year, e.reason || '', e.before, after)
      setRevisions(r => [...r, rev])
    } catch (x) { setSaveState("Couldn't save your plan history. Try again."); return }
    mutate(year, d => { d.editing = null }, { immediate: true })
  }

  async function onDownload() {
    setDlMsg('Building your PDF…')
    try { await downloadPlan(data, year); setDlMsg('Downloaded. Open it to print or share.') }
    catch (x) { setDlMsg("Couldn't download right now. Try again in a moment.") }
  }

  /* ---------- derived ---------- */
  const act = useMemo(() => fubActuals(deals, year), [deals, year])
  const glance = useMemo(() => {
    if (!data) return null
    const py = data.prevYear, prev = py && plans[py]?.data
    if (!prev) return null
    const pAct = fubActuals(deals, py)
    return { py, k: calc(prev), a: plSum(prev, pAct, 0, 11), pEnd: nwTot(prev, 'personal', 11).nw }
  }, [data, plans, deals])
  const yearRevs = revisions.filter(r => r.plan_year === year)
  const mo = key => months[`${year}:${key}`] ?? defaultMonth(year, now)
  const setMo = key => v => setMonths(m => ({ ...m, [`${year}:${key}`]: v }))

  if (loading) return <div className="mb"><div className="wrap single"><p className="note">Loading your business…</p></div></div>
  if (err) return <div className="mb"><div className="wrap single"><h1>My Business</h1><p className="lede">Something went wrong loading your plan: {err}</p></div></div>

  const goTab = t => { setTab(t); topRef.current?.scrollIntoView({ block: 'start' }) }
  const goStep = st => { setTab('plan'); if (!readOnly) mutate(year, d => { d.step = st }); topRef.current?.scrollIntoView({ block: 'start' }) }
  const setStep = st => { if (readOnly) { setPlans(p => ({ ...p, [year]: { ...p[year], data: { ...p[year].data, step: st } } })) } else mutate(year, d => { d.step = st }); topRef.current?.scrollIntoView({ block: 'start' }) }

  const showOctBanner = octOpen && year !== nextY && !plans[nextY]?.committed_at
  let view
  if (tab === 'plan') view = (
    <PlanSteps data={data} set={set} update={update} year={year} step={data.step || 0} setStep={setStep}
      committedAt={committedAt} readOnly={readOnly} onCommit={commit} onEditOpen={() => setEditOpen(true)}
      onEditCancel={cancelEdit} onEditSave={saveEdit} onDownload={onDownload} dlMsg={dlMsg}
      revisions={yearRevs} glance={glance} goTab={goTab} />
  )
  else if (tab === 'pace') view = <GoalTracker data={data} set={set} act={act} thru={mo('pace')} setThru={setMo('pace')} year={year} goTab={goTab} readOnly={readOnly} />
  else if (tab === 'pl') view = <PL data={data} set={set} update={update} act={act} month={mo('pl')} setMonth={setMo('pl')} year={year} goStep={goStep} readOnly={readOnly} />
  else if (tab === 'nw') view = <NetWorth data={data} set={set} month={mo('nw')} setMonth={setMo('nw')} year={year} goStep={goStep} readOnly={readOnly} />
  else {
    const sd = sharedData(data)
    view = !calc(sd).tx ? (
      <div className="wrap single"><div className="main"><h1>What My Leader Sees</h1><p className="lede">Finish your plan first. Your leader's view is built from your goals.</p><button type="button" className="btn" onClick={() => goTab('plan')}>Go to my plan</button></div></div>
    ) : (
      <div className="wrap single"><div className="main"><h1>What My Leader Sees</h1>
        <p className="lede">This is exactly what your leader sees when they open your plan. Your financial clarity, net worth, cost of living, life by design, and monthly P&amp;L stay private.</p>
        <LeaderCard s={summarize(sd)} act={act} revisions={yearRevs} committedAt={committedAt} year={year} thru={mo('leader')} setThru={setMo('leader')} />
      </div></div>
    )
  }

  return (
    <div className="mb" ref={topRef}>
      <div className="top"><div className="top-inner">
        <div className="brand">My Business
          <select className="input" aria-label="Plan year" value={year} onChange={e => { if (e.target.value === 'new') startNextYear(); else switchYear(+e.target.value) }}>
            {years.map(y => <option key={y} value={y}>{y}{y < curY ? ' (past)' : ''}</option>)}
            {octOpen && !plans[nextY] && <option value="new">Start {nextY} plan</option>}
          </select>
          {saveState && !readOnly && <span className="saved">{saveState}</span>}
        </div>
        <div className="tabs" role="tablist">
          {TABS.map(([id, l]) => <button key={id} type="button" className="tab" role="tab" aria-selected={tab === id} onClick={() => goTab(id)}>{l}</button>)}
        </div>
      </div></div>

      {showOctBanner && (
        <div className="topbanner"><div className="banner flex" style={{ margin: 0 }}>
          <span>Your {nextY} plan is open. Start planning.</span>
          <button type="button" className="btn gold" style={{ padding: '8px 16px', fontSize: 13 }} onClick={startNextYear}>Start {nextY} plan</button>
        </div></div>
      )}
      {year < curY && (
        <div className="topbanner"><div className="banner flex" style={{ margin: 0 }}>
          <span>You're looking at your <b>{year}</b> plan. Your current plan is {curY}. Past plans stay visible to you and your leader, and become read-only after January 31.</span>
          <button type="button" className="add" style={{ margin: 0 }} onClick={() => switchYear(curY)}>Go to {curY}</button>
        </div></div>
      )}

      {view}

      {editOpen && createPortal(<EditDialog year={year} onClose={() => setEditOpen(false)} onConfirm={confirmEdit} />, document.body)}
    </div>
  )
}

function EditDialog({ year, onClose, onConfirm }) {
  const [ack, setAck] = useState(false)
  const [why, setWhy] = useState('')
  return (
    <div className="mb-modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal mb" role="dialog" aria-modal="true" aria-labelledby="mb-mt" style={{ minHeight: 0 }}>
        <h2 id="mb-mt" style={{ marginTop: 0 }}>Change your {year} plan?</h2>
        <p className="note" style={{ fontSize: 14 }}>Life changes, and your plan should keep up. Every change is saved to your plan history, and your leader can see what changed and why.</p>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '16px 0', fontWeight: 600 }}>
          <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} style={{ marginTop: 4, accentColor: 'var(--gold)' }} autoFocus />
          I understand that I am changing my goals for {year}.
        </label>
        <div className="field"><label htmlFor="mb-why">What changed?</label>
          <textarea id="mb-why" className="input" style={{ minHeight: 80 }} value={why} onChange={e => setWhy(e.target.value)}
            placeholder="Added a second family trip, cost of living went up, doing less Zillow than planned" /></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>Never mind</button>
          <button type="button" className="btn gold" disabled={!ack} onClick={() => onConfirm(why.trim())}>Edit My Plan</button>
        </div>
      </div>
    </div>
  )
}
