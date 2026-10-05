// Goal Tracker, P&L, and Net Worth tabs. These never lock: they are tracking, not goals.
import {
  ACT, MONTHS, ROYALTY, R, U, $f, $neg, num, filled, budgetMo, budgetYr,
  calc, paceData, plSum, dealCalc, monthActual, nurturesOf, rowVal, nwTot, lastMonth,
} from '../../lib/myBusiness/calc'
import { Private, Shared, Money, MonthSelect, PaceTag, LineChart } from './ui'

const NeedPlan = ({ title, text, goTab }) => (
  <div className="wrap single"><div className="main">
    <h1>{title}</h1><p className="lede">{text}</p>
    <button type="button" className="btn" onClick={() => goTab('plan')}>Go to my plan</button>
  </div></div>
)

/* ---------- Goal Tracker ---------- */
export function GoalTracker({ data, set, act, thru, setThru, year, goTab, readOnly }) {
  const k = calc(data)
  if (!k.tx) return <NeedPlan title="Goal Tracker" text="Finish your plan first. Once you have a transaction goal, this is where you'll track your activity against it." goTab={goTab} />
  const { ytd, frac } = paceData(data, act, thru)
  const nurtures = nurturesOf(data)
  return (
    <div className="wrap single"><div className="main">
      <p className="kicker">Check in every week</p><h1>Are you on pace?</h1>
      <p className="lede">Update your nurtures as the month goes, then see where you stand against the plan.</p>
      <div className="banner">Your appointments, clients, contracts, and closings come from Follow Up Boss. If something is missing or wrong, contact your TC.</div>
      <Shared />
      <MonthSelect value={thru} onChange={setThru} year={year} />
      <fieldset className="locked" disabled={readOnly}>
        <div className="tbl-wrap"><table>
          <thead><tr><th></th><th>{MONTHS[thru]} actual</th><th>Year to date</th><th>Should be at</th><th>Pace</th></tr></thead>
          <tbody>{ACT.map(([a, l]) => {
            const target = k.chain[a] * frac, pct = target ? Math.min(100, ytd[a] / target * 100) : 0, ahead = ytd[a] >= target && target > 0
            const cell = a === 'nurture'
              ? <input className="input" inputMode="numeric" value={data.pace.months[thru]?.nurture ?? ''} aria-label="Nurtures actual" style={{ width: 70, paddingRight: 8 }}
                  onChange={e => set(`pace.months.${thru}.nurture`, e.target.value)} />
              : <span title="From Follow Up Boss">{monthActual(a, thru, nurtures, act)}</span>
            return (
              <tr key={a}><td>{l}</td><td>{cell}</td><td>{R(ytd[a])}</td><td>{U(target)}</td>
                <td><div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}><div className="bar"><i style={{ width: pct + '%' }} /></div><PaceTag on={ahead} /></div></td></tr>
            )
          })}</tbody>
        </table></div>
      </fieldset>
    </div></div>
  )
}

/* ---------- P&L ---------- */
export function PL({ data, set, update, act, month: m, setMonth, year, goStep, readOnly }) {
  const k = calc(data), mo = plSum(data, act, m, m), ytd = plSum(data, act, 0, m), frac = (m + 1) / 12, p = k.plan
  const goalPace = k.income * frac, on = ytd.net >= goalPace && k.income > 0
  const margin = o => (o.gci > 0 ? R(o.net / o.gci * 100) + '%' : '—')
  let cum = 0; const cumVals = [], paceVals = []
  for (let i = 0; i <= m; i++) { cum += plSum(data, act, i, i).net; cumVals.push(cum); paceVals.push(k.income * (i + 1) / 12) }
  const row = (label, a, b, c, cls) => <tr className={cls}><td>{label}</td><td>{a}</td><td>{b}</td><td>{c}</td></tr>
  const M = data.pl.months[m] || {}
  const deals = act.months[m].deals
  const fillBudget = () => update(d => {
    const X = d.pl.months[m] = d.pl.months[m] || {}; X.exp = X.exp || {}
    d.bizExp.forEach(r => { if (!filled(X.exp[r.id]) && budgetMo(r) > 0) X.exp[r.id] = String(R(budgetMo(r))) })
  })
  return (
    <div className="wrap single"><div className="main">
      <p className="kicker">Profit and loss</p><h1>Your P&amp;L</h1>
      <p className="lede">Every deal you close and every dollar you spend, in one place. Net profit is what your business actually pays you, and it's what has to fund your life by design.</p>
      <div className="banner">Your closed deals come from Follow Up Boss. If a deal is missing or wrong, contact your TC.</div>
      <Private />
      <MonthSelect value={m} onChange={setMonth} year={year} />
      <div className="kv" style={{ marginBottom: 8 }}>
        <div><span>Net profit year to date</span><b>{$f(ytd.net)}</b></div>
        <div><span>Income goal pace</span><b>{$f(goalPace)}</b></div>
        <div><span>Status</span><b><PaceTag on={on}>{k.income > 0 ? (on ? 'On pace' : 'Behind') : 'Finish your plan'}</PaceTag></b></div>
        <div><span>Profit margin</span><b>{margin(ytd)}</b></div>
      </div>
      <LineChart labels={MONTHS.slice(0, m + 1)}
        series={[{ vals: paceVals, stroke: 'var(--muted)', w: 1.5, dash: true }, { vals: cumVals, stroke: 'var(--gold)', w: 3, dots: true }]}
        legend={[['Net profit, year to date', { background: 'var(--gold)', height: 3 }], ['Pace to your income goal', 'dash']]} />
      <h2>Statement</h2>
      <div className="tbl-wrap"><table>
        <thead><tr><th></th><th>{MONTHS[m]}</th><th>Year to date</th><th>Plan to date</th></tr></thead>
        <tbody>
          {row('Gross commission (GCI)', $f(mo.gci), $f(ytd.gci), $f(p.gci * frac))}
          {row('Zillow referral fees', $neg(mo.zfee), $neg(ytd.zfee), $neg(p.zfee * frac), 'ind')}
          {row('Agentship split', $neg(mo.split), $neg(ytd.split), $neg(p.split * frac), 'ind')}
          {row('Your commission income', $f(mo.take), $f(ytd.take), $f(p.take * frac), 'key')}
          {row('KW royalty', $neg(mo.royalty), $neg(ytd.royalty), $neg(ROYALTY * frac), 'ind')}
          {row('KW cap', $neg(mo.cap), $neg(ytd.cap), $neg(k.cap * frac), 'ind')}
          {data.bizExp.map(r => <tr key={r.id} className="ind2"><td>{r.l || 'Unnamed expense'}</td><td>{$neg(mo.exp[r.id] || 0)}</td><td>{$neg(ytd.exp[r.id] || 0)}</td><td>{$neg(budgetYr(r) * frac)}</td></tr>)}
          {row('Total business expenses', $neg(mo.expTotal), $neg(ytd.expTotal), $neg(p.exp * frac), 'ind')}
          {row('Net profit', $f(mo.net), $f(ytd.net), $f(p.net * frac), 'key big')}
          {row('Profit margin (of GCI)', margin(mo), margin(ytd), p.gci > 0 ? R(p.net / p.gci * 100) + '%' : '—')}
        </tbody>
      </table></div>
      <p className="note">Closed deals this year: {ytd.deals} of {k.tx || '—'}.</p>

      <h2>Deals Closed in {MONTHS[m]}</h2>
      {deals.length ? (
        <>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Close date</th><th>Side</th><th>Price</th><th>Zillow</th><th>Total commission</th><th>Your take-home</th></tr></thead>
            <tbody>{deals.map(d => {
              const c = dealCalc(d, data.profile.division)
              return (
                <tr key={d.fub_deal_id}>
                  <td>{new Date(d.closed_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td>{d.side === 'seller' ? 'Seller' : d.side === 'buyer' ? 'Buyer' : (d.side || '—')}</td>
                  <td>{$f(num(d.price))}</td>
                  <td>{d.is_zillow ? 'Zillow' : 'Not Zillow'}</td>
                  <td>{d.total_commission == null ? '—' : $f(num(d.total_commission))}</td>
                  <td><b>{$f(c.take)}</b></td>
                </tr>
              )
            })}</tbody>
          </table></div>
          <p className="note">Your take-home is after Zillow and your split.</p>
        </>
      ) : <p className="note">No closed deals in Follow Up Boss for {MONTHS[m]} yet.</p>}

      <fieldset className="locked" disabled={readOnly}>
        <h2>Expenses in {MONTHS[m]}</h2>
        <p className="note">Enter what you actually spent. The gray number is your monthly budget.</p>
        <div className="rows">
          {data.bizExp.map(r => (
            <div className="row exp" key={r.id}><div className="lbl">{r.l || 'Unnamed expense'}</div>
              <Money value={M.exp?.[r.id]} placeholder={R(budgetMo(r)).toLocaleString('en-US')} onChange={v => set(`pl.months.${m}.exp.${r.id}`, v)} /></div>
          ))}
          <div className="row exp"><div className="lbl">KW royalty paid</div><Money value={M.royalty} onChange={v => set(`pl.months.${m}.royalty`, v)} /></div>
          <div className="row exp"><div className="lbl">KW cap paid</div><Money value={M.cap} onChange={v => set(`pl.months.${m}.cap`, v)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" className="add" onClick={fillBudget}>Fill blanks with my budget</button>
          <button type="button" className="add" onClick={() => goStep(5)}>Edit expense categories</button>
        </div>
      </fieldset>
    </div></div>
  )
}

/* ---------- Net Worth ---------- */
function Overview({ data, g, year }) {
  const L = lastMonth(data, g)
  const start = nwTot(data, g, 'start')
  const now = L < 0 ? start : nwTot(data, g, L)
  const ch = now.nw - start.nw
  const m = []; for (let i = 0; i <= L; i++) m.push(nwTot(data, g, i))
  return (
    <>
      <div className="kv">
        <div><span>Net worth now</span><b>{$f(now.nw)}</b></div>
        <div><span>Change since start</span><b>{ch > 0 ? '+' : ''}{$f(ch)}</b></div>
        <div><span>What you own</span><b>{$f(now.a)}</b></div>
        <div><span>What you owe</span><b>{$f(now.d)}</b></div>
      </div>
      <h3 className="sub">{g === 'personal' ? 'Personal' : 'Business'} Net Worth, {year}</h3>
      <LineChart labels={MONTHS}
        series={[
          { vals: MONTHS.map(() => start.nw), stroke: 'var(--muted)', w: 1, dash: '2 4' },
          { vals: m.map(p => p.a), stroke: 'var(--ink)', w: 1.5 },
          { vals: m.map(p => p.d), stroke: 'var(--muted)', w: 1.5, dash: true },
          { vals: m.map(p => p.nw), stroke: 'var(--gold)', w: 3, dots: true },
        ]}
        legend={[['Net worth', { background: 'var(--gold)', height: 3 }], ['What you own', { background: 'var(--ink)' }], ['What you owe', 'dash'], ['Starting net worth', { background: 'repeating-linear-gradient(90deg,var(--muted) 0 2px,transparent 2px 6px)' }]]} />
      {L < 0 && <p className="note">Your line starts with your first monthly update below.</p>}
    </>
  )
}

export function NetWorth({ data, set, month: m, setMonth, year, goStep, readOnly }) {
  const rows = (g, kind) => data.nw[g][kind].map((r, i) => {
    const carry = rowVal(r, m === 0 ? 'start' : m - 1)
    return <div className="row exp" key={i}><div className="lbl">{r.l || 'Unnamed category'}</div>
      <Money value={r.v[m]} placeholder={R(carry).toLocaleString('en-US')} onChange={v => set(`nw.${g}.${kind}.${i}.v.${m}`, v)} /></div>
  })
  const grp = (g, title) => (
    <section className="sum-sec">
      <h2>{title}</h2>
      <Overview data={data} g={g} year={year} />
      <fieldset className="locked" disabled={readOnly}>
        <h3 className="sub">Update for {MONTHS[m]}</h3>
        <p className="note">Leave a line blank if it hasn't changed. The gray number is last month's value.</p>
        <h3 className="sub" style={{ fontSize: 15 }}>What You Own</h3><div className="rows">{rows(g, 'assets')}</div>
        <h3 className="sub" style={{ fontSize: 15 }}>What You Owe</h3><div className="rows">{rows(g, 'debts')}</div>
      </fieldset>
    </section>
  )
  return (
    <div className="wrap single"><div className="main">
      <p className="kicker">Overview</p><h1>Net Worth</h1>
      <p className="lede">Update what you own and owe every month and watch the line move. To rename, add, or remove a category, go to the Net Worth step of your plan.</p>
      <Private />
      <MonthSelect value={m} onChange={setMonth} year={year} />
      {grp('personal', 'Personal')}{grp('business', 'Business')}
      <button type="button" className="btn ghost" onClick={() => goStep(2)}>Edit categories</button>
    </div></div>
  )
}
