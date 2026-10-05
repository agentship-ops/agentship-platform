// My Plan: the 10-step yearly business plan, the live "Your plan so far"
// panel, and the Your Plan summary. Wording and order follow the approved prototype.
import { createPortal } from 'react-dom'
import {
  CLARITY, PROTECTION, LBD, COL_DEFAULT, FUNNEL, ACT, STEPS, LOCKED_STEPS, STD_FUNNEL, ROYALTY, ZILLOW_FEE,
  calc, nwTot, R, U, $f, $neg, num, uid, laneName,
} from '../../lib/myBusiness/calc'
import { Private, Shared, Money, Pct, Text, Freq, LockIcon, fmtDate } from './ui'
import { PlanPLRows, PlanHistory } from './LeaderCard'

const K = i => <p className="kicker">Step {i + 1} of {STEPS.length}</p>

function FunnelRows({ k }) {
  return ACT.map(([key, l]) => {
    const n = k.chain[key] || 0
    return <tr key={key} className={key === 'closed' ? 'key' : undefined}><td>{l}</td><td>{R(n)}</td><td>{U(n / 12)}</td><td>{U(n / 52)}</td></tr>
  })
}

function BizTable({ k }) {
  const sp = k.sp
  return (
    <>
      <div className="tbl-wrap"><table>
        <thead><tr><th>On one average deal</th><th>Non-Zillow</th><th>Zillow</th></tr></thead>
        <tbody>
          <tr><td>Gross commission</td><td>{$f(k.gci)}</td><td>{$f(k.gci)}</td></tr>
          <tr><td>Zillow's 40% off the top</td><td>—</td><td>{$neg(k.gci * ZILLOW_FEE)}</td></tr>
          <tr><td>Your split</td><td>{R(sp.nz * 100)}%</td><td>{R(sp.z * 100)}%</td></tr>
          <tr className="key"><td>You take home</td><td>{$f(k.netNZ)}</td><td>{$f(k.netZ)}</td></tr>
        </tbody>
      </table></div>
      <p className="note">Zillow's 40% comes off before your split.</p>
    </>
  )
}

function LastYearGlance({ glance }) {
  if (!glance) return null
  const { py, k, a, pEnd } = glance
  const row = (l, g, v) => <tr><td>{l}</td><td>{g}</td><td>{v}</td></tr>
  return (
    <>
      <h2>Last Year at a Glance</h2>
      <p className="note">Your {py} plan vs. what actually happened. Start here: what worked, and what needs to change?</p>
      <div className="tbl-wrap"><table>
        <thead><tr><th></th><th>{py} goal</th><th>{py} actual</th></tr></thead>
        <tbody>
          {row('Closings', k.tx || '—', a.deals)}
          {row('Gross commission (GCI)', $f(k.plan.gci), $f(a.gci))}
          {row('Commission income', $f(k.plan.take), $f(a.take))}
          {row('Net profit', $f(k.plan.net), $f(a.net))}
          {row('Personal net worth', $f(k.pS.nw) + ' (start)', $f(pEnd) + ' (end)')}
        </tbody>
      </table></div>
    </>
  )
}

export default function PlanSteps(props) {
  const { data, set, update, year, step, setStep, committedAt, readOnly, onCommit, onEditOpen, onEditCancel, onEditSave, onDownload, dlMsg, revisions, glance, goTab } = props
  const k = calc(data)
  const editing = !!data.editing
  const last = STEPS.length - 1
  const locked = st => !!committedAt && !editing && LOCKED_STEPS.includes(st)

  const rowsAdd = (path, tpl) => update(d => { path.split('.').reduce((o, x) => o[x], d).push(tpl) })
  const rowsDel = (path, i) => update(d => { path.split('.').reduce((o, x) => o[x], d).splice(i, 1) })

  /* ---------- steps ---------- */
  function Start() {
    const dv = data.profile.division
    return (
      <>
        <p className="kicker">Business Planning Clinic</p>
        <h1>Design Your Life, Then Build the Business That Pays for It.</h1>
        <p className="lede">You'll start with your life, not last year's numbers. By the end you'll know what your business has to earn, how many deals that takes, and what your week has to look like to get there. Keep it open. Check it every week to plan your life and make sure you're on pace.</p>
        <div className="field"><label htmlFor="mb-nm">Your name</label><Text id="mb-nm" value={data.profile.name} onChange={v => set('profile.name', v)} placeholder="First and last name" label="Your name" /></div>
        <div className="field"><label>Which lane of Agentship are you in?</label></div>
        <div className="choice">
          <button type="button" aria-pressed={dv === 'program'} onClick={() => set('profile.division', 'program')}><strong>Agentship Program</strong></button>
          <button type="button" aria-pressed={dv === 'collective'} onClick={() => set('profile.division', 'collective')}><strong>Agentship Collective</strong></button>
        </div>
        <p className="note">You're planning for <b>{year}</b>. Switch years at the top of the page.</p>
        <LastYearGlance glance={glance} />
        <div className="banner">Your personal finances and net worth stay private. Your leader sees your business: your goals, planned P&amp;L, activity, and accountability answers.</div>
      </>
    )
  }

  function Clarity() {
    return (
      <>
        {K(1)}<h1>Financial Clarity</h1>
        <p className="lede">Rate each statement from 1 (weak) to 5 (strong). Clarity is kind, so be honest. This is your starting line, not a grade.</p><Private />
        {CLARITY.map((q, i) => (
          <div key={i} className={'rate-row' + (i === 0 ? ' rate-first' : '')}>
            <div>{q}</div>
            <div className="scale" role="group" aria-label="Rating">
              {[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-pressed={data.clarity[i] === n} onClick={() => update(d => { d.clarity[i] = n })}>{n}</button>)}
            </div>
          </div>
        ))}
        <div className="score"><b>{k.score == null ? '—' : k.score + '%'}</b><span className="note">your financial clarity score</span></div>
        <h2>Protection</h2><p className="note" style={{ marginTop: -4 }}>Do you have these in place?</p>
        {PROTECTION.map(([key, l], i) => (
          <div key={key} className={'rate-row' + (i === 0 ? ' rate-first' : '')}>
            <div>{l}</div>
            <div className="yn">{['Yes', 'No'].map(v => <button type="button" key={v} aria-pressed={data.protection[key] === v} onClick={() => set('protection.' + key, v)}>{v}</button>)}</div>
          </div>
        ))}
      </>
    )
  }

  function RowsMoney({ path }) {
    const list = path.split('.').reduce((o, x) => o[x], data)
    return (
      <>
        <div className="rows">{list.map((r, i) => (
          <div className="row two" key={i}>
            <Text value={r.l} onChange={v => set(`${path}.${i}.l`, v)} placeholder="Category" />
            <Money value={r.v.start} onChange={v => set(`${path}.${i}.v.start`, v)} />
            <button type="button" className="x" aria-label="Remove" onClick={() => rowsDel(path, i)}>×</button>
          </div>
        ))}</div>
        <button type="button" className="add" onClick={() => rowsAdd(path, { l: '', v: {} })}>Add category</button>
      </>
    )
  }
  function NwBlock({ g, title }) {
    const t = nwTot(data, g, 'start')
    return (
      <>
        <h2>{title}</h2>
        <h3 className="sub">What You Own</h3>{RowsMoney({ path: `nw.${g}.assets` })}<div className="total"><span>Total</span><b>{$f(t.a)}</b></div>
        <h3 className="sub">What You Owe</h3>{RowsMoney({ path: `nw.${g}.debts` })}<div className="total"><span>Total</span><b>{$f(t.d)}</b></div>
        <div className="cascade"><div className="step-line result"><span>{title} today</span><b>{$f(t.nw)}</b></div></div>
      </>
    )
  }
  function NetWorth() {
    return (
      <>
        {K(2)}<h1>Net Worth</h1>
        <p className="lede">What you own minus what you owe, once for your personal life and once for your business. Everyone's finances look different, so rename, add, or remove any category to match what you actually own and owe.</p><Private />
        {NwBlock({ g: 'personal', title: 'Personal Net Worth' })}
        {NwBlock({ g: 'business', title: 'Business Net Worth' })}
        <p className="note">This is your starting point. Each month you'll update these on the Net Worth tab and watch your progress on the chart.</p>
      </>
    )
  }

  function LifeByDesign() {
    return (
      <>
        {K(3)}<h1>Life by Design</h1>
        <p className="lede">At the end of the year, what would make you say "I truly lived a life by design"? Answer without using what you earn today as the limit.</p><Private />
        {LBD.map(([key, q, ph]) => (
          <div key={key}>
            <h2 style={{ fontSize: 19 }}>{q}</h2>
            <div className="rows">{(data.lbd[key] || []).map((r, i) => (
              <div className="row three" key={i}>
                <Text value={r.d} onChange={v => set(`lbd.${key}.${i}.d`, v)} placeholder={ph} label="Description" />
                <Text value={r.t} onChange={v => set(`lbd.${key}.${i}.t`, v)} placeholder="When" label="Time frame" />
                <Money value={r.c} onChange={v => set(`lbd.${key}.${i}.c`, v)} />
                <button type="button" className="x" aria-label="Remove" onClick={() => rowsDel(`lbd.${key}`, i)}>×</button>
              </div>
            ))}</div>
            <button type="button" className="add" onClick={() => rowsAdd(`lbd.${key}`, { d: '', t: '', c: '' })}>Add another</button>
          </div>
        ))}
        <div className="total"><span>Total cost of your life by design</span><b>{$f(k.a)}</b></div>
      </>
    )
  }

  function CostOfLiving() {
    return (
      <>
        {K(4)}<h1>Cost of Living</h1>
        <p className="lede">Your normal personal life, not counting the life by design items. Mark anything you pay once a year as yearly and we'll do the math. Business costs come next, on their own page.</p><Private />
        <div className="rows">{data.col.map((r, i) => (
          <div className="row col" key={i}>
            {i < COL_DEFAULT.length ? <div className="lbl">{r.l}</div> : <Text value={r.l} onChange={v => set(`col.${i}.l`, v)} placeholder="Other expense" />}
            <Freq value={r.f} onChange={v => set(`col.${i}.f`, v)} />
            <Money value={r.v} onChange={v => set(`col.${i}.v`, v)} />
          </div>
        ))}</div>
        <button type="button" className="add" onClick={() => rowsAdd('col', { l: '', v: '', f: 'mo' })}>Add expense</button>
        <div className="total"><span>Monthly cost of living</span><b>{$f(k.monthly)}</b></div>
        <div className="total thin"><span>Yearly cost of living</span><b>{$f(k.c)}</b></div>
      </>
    )
  }

  function BizExpenses() {
    return (
      <>
        {K(5)}<h1>Business Expenses</h1>
        <p className="lede">What does it cost to run your business for a year? This becomes your budget, and your P&amp;L will track you against it every month. Rename, add, or remove anything so it matches how you actually run your business.</p><Private />
        <div className="banner">Agentship already covers some of these for you, like Follow Up Boss, branded marketing, and coaching. Wherever Agentship covers it, enter 0.</div>
        <p className="note" style={{ marginTop: -6 }}>Don't include Zillow's fee, your split, or your KW royalty and cap. Those are already built in.</p>
        <div className="rows">{data.bizExp.map((r, i) => (
          <div className="row bex" key={r.id}>
            <Text value={r.l} onChange={v => set(`bizExp.${i}.l`, v)} placeholder="Expense" />
            <Freq value={r.f} onChange={v => set(`bizExp.${i}.f`, v)} />
            <Money value={r.v} onChange={v => set(`bizExp.${i}.v`, v)} />
            <button type="button" className="x" aria-label="Remove" onClick={() => rowsDel('bizExp', i)}>×</button>
          </div>
        ))}</div>
        <button type="button" className="add" onClick={() => rowsAdd('bizExp', { id: uid(), l: '', v: '', f: 'mo' })}>Add expense</button>
        <div className="total"><span>Monthly business expenses</span><b>{$f(k.bizYr / 12)}</b></div>
        <div className="total thin"><span>Yearly business expenses</span><b>{$f(k.bizYr)}</b></div>
      </>
    )
  }

  function YourBusiness() {
    return (
      <>
        {K(6)}<h1>Your Business</h1>
        <p className="lede">Now we find out what one deal is actually worth to you, and how many it takes to fund your life and run your business.</p><Shared />
        <div className="grid2">
          <div className="field"><label>Average sales price</label><Money value={data.biz.price} onChange={v => set('biz.price', v)} placeholder="400,000" /></div>
          <div className="field"><label>Commission you expect to earn</label><Pct value={data.biz.rate} onChange={v => set('biz.rate', v)} placeholder="3" label="Commission percent" /></div>
        </div>
        <div className="field"><label htmlFor="mb-zr">Where will your business come from?</label>
          <input id="mb-zr" type="range" min="0" max="100" step="5" value={num(data.biz.zillow)} onChange={e => set('biz.zillow', Number(e.target.value))} style={{ accentColor: 'var(--gold)', width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>Zillow <b>{R(k.zp * 100)}%</b></span><span>Non-Zillow <b>{R(100 - k.zp * 100)}%</b></span></div>
        </div>
        <div className="grid2">
          <div className="field"><label>KW cap for your market center</label><Money value={data.biz.cap} onChange={v => set('biz.cap', v)} placeholder="0" /><span className="note">Ask your leader if you're not sure. Enter 0 if you have none.</span></div>
          <div className="field"><label>KW royalty</label><div className="input" style={{ background: 'var(--soft)' }}>{$f(ROYALTY)}</div><span className="note">The same for every agent.</span></div>
        </div>
        <BizTable k={k} />
        <div className="cascade">
          <div className="step-line"><span>Your income goal (life by design + cost of living)</span><b>{$f(k.income)}</b></div>
          <div className="step-line"><span>Plus business expenses</span><b>{$f(k.bizYr)}</b></div>
          <div className="step-line"><span>Plus KW royalty and cap</span><b>{$f(k.kw)}</b></div>
          <div className="step-line"><span>Take-home your deals need to produce</span><b>{$f(k.need)}</b></div>
          <div className="step-line"><span>Divided by your average take-home per deal</span><b>{$f(k.blended)}</b></div>
          <div className="step-line result"><span>Your transaction goal</span><b>{k.tx || '—'}</b></div>
          <div className="step-line"><span>Deals just to cover your cost of living and business</span><b>{k.breakEven || '—'}</b></div>
        </div>
      </>
    )
  }

  function Activity() {
    return (
      <>
        {K(7)}<h1>Your Activity</h1>
        <p className="lede">Work backward from <b>{k.tx || 'your'}</b> closings. {data.funnelFrom ? `These are prefilled with your actual conversion rates from ${data.funnelFrom}. Adjust them if you're changing how you work.` : 'Use your own conversion rates from your WIG year-to-date totals if you have them. If not, start with the Agentship standards below.'}</p><Shared />
        <div className="tbl-wrap"><table>
          <thead><tr><th>Conversion rate</th><th></th></tr></thead>
          <tbody>{FUNNEL.map(([key, , desc]) => (
            <tr key={key}><td>{desc}</td><td><Pct style={{ display: 'inline-block' }} value={data.funnel[key]} onChange={v => set('funnel.' + key, v)} label={desc} /></td></tr>
          ))}</tbody>
        </table></div>
        <button type="button" className="add" onClick={() => update(d => { d.funnel = { ...STD_FUNNEL } })}>Reset to Agentship standards</button>
        <h2>What It Takes</h2>
        <div className="tbl-wrap"><table><thead><tr><th></th><th>This year</th><th>Each month</th><th>Each week</th></tr></thead><tbody><FunnelRows k={k} /></tbody></table></div>
        <p className="note">Monthly and weekly numbers round up. You can't go on half an appointment.</p>
      </>
    )
  }

  function Accountability() {
    return (
      <>
        {K(8)}<h1>Accountability</h1>
        <p className="lede">You know your numbers now. A goal without a system is a wish. How will you make sure this happens?</p><Shared />
        <div className="field"><label htmlFor="mb-a1">How will you hold yourself accountable to your goals?</label><textarea id="mb-a1" className="input" value={data.acc.self} onChange={e => set('acc.self', e.target.value)} /></div>
        <div className="field"><label htmlFor="mb-a2">How would you like your leader to hold you accountable?</label><textarea id="mb-a2" className="input" value={data.acc.leader} onChange={e => set('acc.leader', e.target.value)} /></div>
      </>
    )
  }

  function Summary() {
    return (
      <>
        <p className="kicker">{laneName(data.profile.division)}</p>
        <h1>{data.profile.name ? data.profile.name + "'s" : 'Your'} {year} Plan</h1>
        {!committedAt && !readOnly && (
          <div className="banner flex"><span>This plan isn't locked in yet. Lock it in when your goals are set. You can still change it later on purpose.</span><button type="button" className="btn gold" onClick={onCommit}>Lock In My Plan</button></div>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 18px' }}>
          <button type="button" className="btn gold" onClick={onDownload}>Download PDF</button>
          <span className="note">{dlMsg || 'Print it, or share it with your spouse.'}</span>
        </div>
        <p className="lede">This is your plan. Check your Goal Tracker every week so your calendar matches your goals, and update your P&amp;L and Net Worth every month. If your life or your business changes, change the inputs and the plan updates.</p>
        <div className="sum-sec"><Shared /><h2>Your Goals</h2><div className="kv">
          <div><span>Income goal</span><b>{$f(k.income)}</b></div>
          <div><span>Transaction goal</span><b>{k.tx || '—'}</b></div>
          <div><span>GCI goal</span><b>{$f(k.plan.gci)}</b></div>
          <div><span>Sales volume goal</span><b>{$f(k.volume)}</b></div>
          <div><span>Break-even deals</span><b>{k.breakEven || '—'}</b></div>
          <div><span>Take-home per deal</span><b>{$f(k.blended)}</b></div>
        </div></div>
        <div className="sum-sec"><Shared /><h2>Your Activity</h2>
          <div className="tbl-wrap"><table><thead><tr><th></th><th>This year</th><th>Each month</th><th>Each week</th></tr></thead><tbody><FunnelRows k={k} /></tbody></table></div></div>
        <div className="sum-sec"><Shared /><h2>Accountability</h2>
          <p className="note">How I'll hold myself accountable</p><p className="quote">{data.acc.self || 'Not answered yet.'}</p>
          <p className="note">How I want my leader to hold me accountable</p><p className="quote">{data.acc.leader || 'Not answered yet.'}</p></div>
        <div className="sum-sec"><Shared /><h2>Your Planned P&amp;L</h2>
          <div className="tbl-wrap"><table className="narrow"><thead><tr><th>{year}</th><th>Planned</th></tr></thead><tbody><PlanPLRows s={{ plan: k.plan, income: k.income }} /></tbody></table></div></div>
        {revisions && revisions.length > 0 && <div className="sum-sec"><Shared /><PlanHistory revisions={revisions} committedAt={committedAt} /></div>}
        <div className="sum-sec"><Private /><h2>Your Foundation</h2><div className="kv">
          <div><span>Financial clarity score</span><b>{k.score == null ? '—' : k.score + '%'}</b></div>
          <div><span>Personal net worth</span><b>{$f(k.pS.nw)}</b></div>
          <div><span>Business net worth</span><b>{$f(k.bS.nw)}</b></div>
          <div><span>Life by design</span><b>{$f(k.a)}</b></div>
          <div><span>Yearly cost of living</span><b>{$f(k.c)}</b></div>
          <div><span>Protection in place</span><b>{PROTECTION.filter(([p]) => data.protection[p] === 'Yes').length} of 4</b></div>
        </div></div>
      </>
    )
  }

  const RENDER = [Start, Clarity, NetWorth, LifeByDesign, CostOfLiving, BizExpenses, YourBusiness, Activity, Accountability, Summary]
  const st = Math.min(Math.max(step || 0, 0), last)

  function LockBar() {
    if (!committedAt || readOnly) return null
    if (editing) return (
      <div className="lockbar editing">
        <span><b>You're editing your {year} plan.</b> Your goals update when you save.</span>
        <span style={{ display: 'flex', gap: 8 }}><button type="button" className="btn ghost" onClick={onEditCancel}>Cancel</button><button type="button" className="btn gold" onClick={onEditSave}>Save changes</button></span>
      </div>
    )
    if (!LOCKED_STEPS.includes(st) && st !== last) return null
    return (
      <div className="lockbar">
        <span><LockIcon /> <b>Your plan is locked in</b> as of {fmtDate(committedAt)}.</span>
        <button type="button" className="btn ghost" onClick={onEditOpen}>Edit My Plan</button>
      </div>
    )
  }

  const body = RENDER[st]()
  const navBtn = st < last - 1
    ? <button type="button" className="btn" onClick={() => setStep(st + 1)}>Continue</button>
    : st === last - 1
      ? (committedAt || readOnly ? <button type="button" className="btn gold" onClick={() => setStep(st + 1)}>See my plan</button> : <button type="button" className="btn gold" onClick={onCommit}>Lock In My Plan</button>)
      : <button type="button" className="btn" onClick={() => goTab('pace')}>Go to my goal tracker</button>

  return (
    <div className="wrap">
      <ol className="steps">{STEPS.map((s, i) => (
        <li key={s}><button type="button" aria-current={i === st ? 'step' : undefined} className={i < st ? 'done' : ''} onClick={() => setStep(i)}>{s}</button></li>
      ))}</ol>
      <div className="main">
        <LockBar />
        <fieldset className="locked" disabled={(readOnly || locked(st)) && st !== last}>{body}</fieldset>
        <div className="nav">
          {st > 0 ? <button type="button" className="btn ghost" onClick={() => setStep(st - 1)}>Back</button> : <span />}
          {navBtn}
        </div>
      </div>
      <aside className="ledger" aria-label="Your plan so far">
        <h3>Your plan so far</h3><p className="note">Updates as you type.</p>
        <div className="l-item"><span>Life by design</span><b>{$f(k.a)}</b></div>
        <div className="l-item"><span>Yearly cost of living</span><b>{$f(k.c)}</b></div>
        <div className="l-big sm"><span>Income goal</span><b>{$f(k.income)}</b></div>
        <div className="l-item"><span>Yearly business expenses</span><b>{$f(k.bizYr)}</b></div>
        <div className="l-item"><span>Take-home per deal</span><b>{$f(k.blended)}</b></div>
        <div className="l-item"><span>Break-even deals</span><b>{k.breakEven || '—'}</b></div>
        <div className="l-big"><span>Transaction goal</span><b>{k.tx || '—'}</b></div>
        <div className="l-item"><span>Appointments set each week</span><b>{k.tx ? U(k.chain.set / 52) : '—'}</b></div>
        <div className="l-item"><span>Nurtures each week</span><b>{k.tx ? U(k.chain.nurture / 52) : '—'}</b></div>
      </aside>
      {createPortal(
        <div className="mb-mbar"><div><span>Income goal</span><b>{$f(k.income)}</b></div><div style={{ textAlign: 'right' }}><span>Transaction goal</span><b>{k.tx || '—'}</b></div></div>,
        document.body,
      )}
    </div>
  )
}
