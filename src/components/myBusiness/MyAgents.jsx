// My Agents: leaders and admins see every agent's business at a glance,
// furthest behind at the top. Built only from shared data (mb_plan_goals,
// mb_plan_revisions, and Follow Up Boss deals); private plans are never read.
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { fubActuals, activityYtd, dealSum, monthActual, U, R, $f } from '../../lib/myBusiness/calc'
import { fubIdMap, DEAL_FIELDS } from '../../lib/myBusiness/data'
import LeaderCard from './LeaderCard'
import { MonthSelect, PaceTag } from './ui'
import './mb.css'

const fullName = p => [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed'

export default function MyAgents() {
  const { profile } = useAuth()
  const isAdmin = profile?.account_type === 'admin'
  const now = new Date(), curY = now.getFullYear()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [idMap, setIdMap] = useState({})
  const [goals, setGoals] = useState([])
  const [revs, setRevs] = useState([])
  const [deals, setDeals] = useState([])
  const [year, setYear] = useState(curY)
  const [thru, setThru] = useState(now.getMonth())
  const [sel, setSel] = useState(null)
  const [unlocked, setUnlocked] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [{ map, profiles: pr }, g, r, d] = await Promise.all([
          fubIdMap(),
          supabase.from('mb_plan_goals').select('*'),
          supabase.from('mb_plan_revisions').select('id,user_id,plan_year,changed_at,reason,before,after'),
          supabase.from('leaderboard_deals').select(DEAL_FIELDS),
        ])
        for (const x of [g, r, d]) if (x.error) throw x.error
        if (!alive) return
        setProfiles(pr); setIdMap(map); setGoals(g.data || []); setRevs(r.data || []); setDeals(d.data || [])
        setLoading(false)
      } catch (e) { if (alive) { setErr(e.message || String(e)); setLoading(false) } }
    })()
    return () => { alive = false }
  }, [])

  const years = useMemo(() => [...new Set([curY, ...goals.map(g => g.plan_year)])].sort((a, b) => a - b), [goals, curY])
  function changeYear(y) { setYear(y); setThru(y < curY ? 11 : y > curY ? 0 : now.getMonth()); setSel(null) }

  const rows = useMemo(() => {
    const goalOf = {}; goals.filter(g => g.plan_year === year).forEach(g => { goalOf[g.user_id] = g })
    const people = profiles.filter(p => p.account_type === 'agent' || goalOf[p.id])
    return people.map(p => {
      const g = goalOf[p.id]
      const ids = idMap[p.id] || []
      const act = fubActuals(deals.filter(d => ids.includes(Number(d.owner_fub_user_id))), year)
      if (!g || !g.committed_at) return { p, g, act, noPlan: true, ratio: -1 }
      const s = g.summary, frac = (thru + 1) / 12
      const ytd = activityYtd(s.nurtures || [], act, thru), inc = dealSum(act, s.division, 0, thru)
      const cT = s.tx * frac, gT = s.gci * frac
      const ok = (v, t) => v >= t && t > 0
      return {
        p, g, act, s, ytd, inc, cT, gT,
        setGoal: U((s.chain.set || 0) / 12), setAct: monthActual('set', thru, s.nurtures || [], act),
        onAll: ok(ytd.closed, cT) && ok(inc.gci, gT), ratio: cT ? ytd.closed / cT : 0,
      }
    }).sort((a, b) => a.ratio - b.ratio)
  }, [profiles, idMap, goals, deals, year, thru])

  const current = sel && rows.find(r => r.p.id === sel)

  useEffect(() => {
    setUnlocked(null)
    if (!isAdmin || !current || year >= curY) return
    supabase.rpc('mb_plan_unlocked', { p_user: current.p.id, p_year: year }).then(({ data }) => setUnlocked(!!data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, year, isAdmin])

  async function toggleUnlock() {
    const next = !unlocked
    const { data, error } = await supabase.rpc('mb_set_plan_unlocked', { p_user: current.p.id, p_year: year, p_unlocked: next })
    if (!error && data) setUnlocked(next)
  }

  if (loading) return <div className="mb"><div className="wrap single"><p className="note">Loading your agents…</p></div></div>
  if (err) return <div className="mb"><div className="wrap single"><h1>My Agents</h1><p className="lede">Something went wrong: {err}</p></div></div>

  const header = (
    <div className="ctl-row">
      <div className="field"><label>Year</label>
        <select className="input" value={year} onChange={e => changeYear(+e.target.value)}>
          {years.map(y => <option key={y} value={y}>{y}{y < curY ? ' (past)' : ''}</option>)}
        </select>
      </div>
      <MonthSelect label="Through month" value={thru} onChange={setThru} year={year} />
    </div>
  )

  if (current) {
    return (
      <div className="mb"><div className="wrap single"><div className="main">
        <button type="button" className="btn ghost" style={{ marginBottom: 18 }} onClick={() => setSel(null)}>All agents</button>
        <p className="kicker">Business plan</p><h1>{fullName(current.p)}</h1>
        {current.noPlan ? (
          <p className="lede">No locked-in plan for {year} yet. This is a good one to follow up on after the clinic.</p>
        ) : (
          <LeaderCard s={{ ...current.s, name: fullName(current.p) }} act={current.act} year={year} thru={thru} setThru={setThru}
            revisions={revs.filter(r => r.user_id === current.p.id && r.plan_year === year)} committedAt={current.g.committed_at}>
            {isAdmin && year < curY && unlocked != null && (
              <div className="banner flex" style={{ marginTop: 16, marginBottom: 0 }}>
                <span>{unlocked ? `${year} is unlocked. This agent can edit it.` : new Date() > new Date(year + 1, 0, 31, 23, 59, 59) ? `${year} is read-only for this agent.` : `${year} becomes read-only after January 31, ${year + 1}.`}</span>
                <button type="button" className="btn ghost" style={{ padding: '8px 16px', fontSize: 13 }} onClick={toggleUnlock}>{unlocked ? `Lock ${year}` : `Unlock ${year}`}</button>
              </div>
            )}
          </LeaderCard>
        )}
      </div></div></div>
    )
  }

  return (
    <div className="mb"><div className="wrap single"><div className="main">
      <p className="kicker">Leader view</p><h1>My Agents</h1>
      <p className="lede">Everyone's business at a glance, with whoever is furthest behind at the top. Click a name to open their business plan.</p>
      {header}
      <div className="tbl-wrap"><table>
        <thead><tr><th>Agent</th><th>Lane</th><th>Closings YTD / plan</th><th>GCI YTD / plan</th><th>Appts set this month / goal</th><th>Pace</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.p.id}>
            <td><button type="button" className="linkbtn" onClick={() => { setSel(r.p.id); setThru(thru) }}>{fullName(r.p)}</button></td>
            {r.noPlan ? (
              <><td>{r.g?.lane === 'program' ? 'Program' : r.g?.lane === 'collective' ? 'Collective' : '—'}</td><td>{r.act.months.slice(0, thru + 1).reduce((s, m) => s + m.closed, 0)} / —</td><td>—</td><td>{r.act.months[thru].set} / —</td><td><span className="tag">No plan yet</span></td></>
            ) : (
              <><td>{r.s.division === 'program' ? 'Program' : 'Collective'}</td>
                <td>{R(r.ytd.closed)} / {U(r.cT)}</td><td>{$f(r.inc.gci)} / {$f(r.gT)}</td><td>{r.setAct} / {r.setGoal}</td>
                <td><PaceTag on={r.onAll} /></td></>
            )}
          </tr>
        ))}</tbody>
      </table></div>
    </div></div></div>
  )
}
