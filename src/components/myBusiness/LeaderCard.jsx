// The card a leader sees for one agent. Agents see this same card, for
// themselves only, under "What My Leader Sees". Built only from shared data:
// the plan goals summary, plan history, and Follow Up Boss deals.
import { useState } from 'react'
import { ACT, MONTHS, STAGES, TRAJ, R, U, $f, $neg, num, laneName, activityYtd, monthActual, dealSum } from '../../lib/myBusiness/calc'
import { MonthSelect, Seg, PaceTag, LineChart, fmtDate } from './ui'

export function PlanPLRows({ s }) {
  const p = s.plan
  return (
    <>
      <tr><td>Gross commission (GCI)</td><td>{$f(p.gci)}</td></tr>
      <tr className="ind"><td>Zillow referral fees</td><td>{$neg(p.zfee)}</td></tr>
      <tr className="ind"><td>Agentship split</td><td>{$neg(p.split)}</td></tr>
      <tr className="key"><td>Your commission income</td><td>{$f(p.take)}</td></tr>
      <tr className="ind"><td>KW royalty and cap</td><td>{$neg(p.kw)}</td></tr>
      <tr className="ind"><td>Business expenses</td><td>{$neg(p.exp)}</td></tr>
      <tr className="key big"><td>Net profit (what your business pays you)</td><td>{$f(p.net)}</td></tr>
      <tr className="ind"><td>Your income goal</td><td>{$f(s.income)}</td></tr>
    </>
  )
}

export function PlanHistory({ revisions, committedAt }) {
  if (!revisions || !revisions.length) return null
  const ch = (a, b, f) => (a === b ? f(b) : <>{f(a)} → <b>{f(b)}</b></>)
  return (
    <>
      <h2>Plan History</h2>
      <p className="note">{committedAt ? `Locked in ${fmtDate(committedAt)}. ` : ''}Every change since then:</p>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Changed</th><th>Income goal</th><th>Transactions</th><th>GCI goal</th></tr></thead>
        <tbody>
          {revisions.slice().sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at))).map(r => (
            <tr key={r.id || r.changed_at}>
              <td style={{ whiteSpace: 'normal' }}><b>{fmtDate(r.changed_at)}</b><br /><span className="note">{r.reason || 'No reason given'}</span></td>
              <td>{ch(R(r.before?.income || 0), R(r.after?.income || 0), $f)}</td>
              <td>{ch(r.before?.tx || 0, r.after?.tx || 0, String)}</td>
              <td>{ch(R(r.before?.gci || 0), R(r.after?.gci || 0), $f)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  )
}

export default function LeaderCard({ s, act, revisions, committedAt, year, thru, setThru, they = true, children }) {
  const [period, setPeriod] = useState('month')
  const [metric, setMetric] = useState('nurture')
  const nurtures = s.nurtures || []
  const ytd = activityYtd(nurtures, act, thru)
  const frac = (thru + 1) / 12
  const tgt = s.tx * frac, on = ytd.closed >= tgt && s.tx > 0
  const inc = dealSum(act, s.division, 0, thru)
  const pg = s.plan.gci * frac, pt = s.plan.take * frac
  const ok = (v, t) => v >= t && t > 0
  const weeks = (thru + 1) * 52 / 12

  const actRows = ACT.map(([key, l]) => {
    const goalYr = s.chain[key] || 0
    let goal, actual
    if (period === 'year') { goal = R(goalYr); actual = ytd[key] }
    else if (period === 'month') { goal = U(goalYr / 12); actual = monthActual(key, thru, nurtures, act) }
    else { goal = U(goalYr / 52); actual = Math.round(ytd[key] / weeks * 10) / 10 }
    const pct = goal ? Math.round(actual / goal * 100) : 0
    return (
      <tr key={key} className={key === 'closed' ? 'key' : undefined}>
        <td>{l}</td><td>{goal}</td><td>{actual}</td>
        <td><div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}><div className="bar"><i style={{ width: Math.min(100, pct) + '%' }} /></div><span style={{ minWidth: 42 }}>{goal ? pct + '%' : '—'}</span></div></td>
      </tr>
    )
  })
  const periodLabel = period === 'year' ? 'Year to date vs. the full-year goal' : period === 'month' ? `${MONTHS[thru]} ${year}` : `Average week, January through ${MONTHS[thru]}`

  const rateRows = STAGES.map(([from, to, l]) => {
    const goal = num(s.funnel[from])
    const a = ytd[from] > 0 ? Math.round(ytd[to] / ytd[from] * 100) : null
    const diff = a == null ? '—' : (a - goal > 0 ? '+' : '') + (a - goal) + ' pts'
    return <tr key={from}><td>{l}</td><td>{goal}%</td><td>{a == null ? '—' : a + '%'}</td><td>{diff}</td></tr>
  })

  const metricName = TRAJ.find(t => t[0] === metric)[1]
  const trajActual = []; for (let i = 0; i <= thru; i++) trajActual.push(monthActual(metric, i, nurtures, act))
  const trajGoal = MONTHS.map(() => U((s.chain[metric] || 0) / 12))

  return (
    <article className="agent-card">
      <header><h3>{s.name || 'Your name'}</h3><span className="note">{laneName(s.division)}</span></header>
      <div className="kv">
        <div><span>Income goal</span><b>{$f(s.income)}</b></div>
        <div><span>Transaction goal</span><b>{s.tx || '—'}</b></div>
        <div><span>GCI goal</span><b>{$f(s.gci)}</b></div>
        <div><span>Closings YTD</span><b>{R(ytd.closed)} <PaceTag on={on} /></b></div>
      </div>
      {children}
      <div style={{ marginTop: 20 }}><MonthSelect label="Through month" value={thru} onChange={setThru} year={year} /></div>

      <h2>Income vs. Plan</h2>
      <p className="note">Year to date through {MONTHS[thru]}, from closed deals in Follow Up Boss</p>
      <div className="tbl-wrap"><table>
        <thead><tr><th></th><th>Actual YTD</th><th>Plan to date</th><th>Full-year plan</th><th></th></tr></thead>
        <tbody>
          <tr><td>Gross commission (GCI)</td><td>{$f(inc.gci)}</td><td>{$f(pg)}</td><td>{$f(s.plan.gci)}</td><td><PaceTag on={ok(inc.gci, pg)} /></td></tr>
          <tr className="key"><td>Commission income (after Zillow and split)</td><td>{$f(inc.take)}</td><td>{$f(pt)}</td><td>{$f(s.plan.take)}</td><td><PaceTag on={ok(inc.take, pt)} /></td></tr>
        </tbody>
      </table></div>

      <h2>Planned P&amp;L</h2>
      <div className="tbl-wrap"><table className="narrow"><thead><tr><th>{year}</th><th>Planned</th></tr></thead><tbody><PlanPLRows s={s} /></tbody></table></div>

      <div className="headrow"><h2>Activity: Goal vs. Actual</h2><Seg value={period} onChange={setPeriod} options={[['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Annually']]} /></div>
      <p className="note">{periodLabel}</p>
      <div className="tbl-wrap"><table><thead><tr><th></th><th>Goal</th><th>Actual</th><th>Of goal</th></tr></thead><tbody>{actRows}</tbody></table></div>

      <h2>Conversion Rates</h2>
      <p className="note">Goal rates from the plan vs. actual rates year to date</p>
      <div className="tbl-wrap"><table><thead><tr><th></th><th>Goal</th><th>Actual</th><th>Difference</th></tr></thead><tbody>{rateRows}</tbody></table></div>

      <div className="headrow"><h2>Business Trajectory</h2></div>
      <Seg value={metric} onChange={setMetric} options={TRAJ} />
      <LineChart labels={MONTHS} count
        series={[{ vals: trajGoal, stroke: 'var(--muted)', w: 1.5, dash: true }, { vals: trajActual, stroke: 'var(--gold)', w: 3, dots: true }]}
        legend={[[`${metricName} completed each month`, { background: 'var(--gold)', height: 3 }], ['Monthly goal', 'dash']]} />

      <PlanHistory revisions={revisions} committedAt={committedAt} />

      <h2>Accountability</h2>
      <p className="note">How {they ? "they'll hold themselves" : "I'll hold myself"} accountable</p>
      <p className="quote">{s.acc?.self || 'Not answered yet.'}</p>
      <p className="note">How {they ? 'they want their' : 'I want my'} leader to hold {they ? 'them' : 'me'} accountable</p>
      <p className="quote">{s.acc?.leader || 'Not answered yet.'}</p>
    </article>
  )
}
