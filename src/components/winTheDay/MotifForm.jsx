import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

// The MOTIF form. Step 1: pick the FUB person. Step 2: the five boxes. Step 3: saved.
// Everything is saved by /api/nurture, which also updates Follow Up Boss.

const GOLD = '#C9A84C'
const ORDER = ['lead', 'attempted contact', 'spoke with customer', 'nurture', 'appointment set', 'met with customer',
  'showing homes', 'listing agreement', 'active listing', 'submitting offers', 'under contract']
const LISTS = { 1: 'Weekly Nurtures', 2: 'Bi-Weekly Nurtures', 3: 'Monthly Nurtures', 4: 'Quarterly Nurtures', 5: 'Quarterly Nurtures' }
const CADENCE = { 1: 'Weekly', 2: 'Bi-Weekly', 3: 'Monthly', 4: 'Quarterly', 5: 'Quarterly' }
const OUTCOMES = [
  { id: 'appt', name: 'Appointment set' },
  { id: 'keep', name: 'Not ready yet, keep in touch' },
  { id: 'working', name: 'Already working with me' },
]

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { Authorization: `Bearer ${session.access_token}` } : {}
}

function nextStage(current, outcome) {
  const cur = (current || '').trim().toLowerCase()
  if (outcome === 'working' || cur === 'trash') return null
  const target = outcome === 'appt' ? 'Appointment set' : 'Nurture'
  if (cur === 'closed' || cur === 'database') return target
  const ci = ORDER.indexOf(cur), ti = ORDER.indexOf(target.toLowerCase())
  if (ci === -1) return target
  return ci >= ti ? null : target
}

export default function MotifForm({ timeframes, onClose, onSaved }) {
  const [step, setStep] = useState('pick')
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState([])
  const [searching, setSearching] = useState(false)
  const [person, setPerson] = useState(null)
  const [m, setM] = useState(false)
  const [why, setWhy] = useState('')
  const [o, setO] = useState(false)
  const [tf, setTf] = useState(null)
  const [i, setI] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    clearTimeout(timer.current)
    const q = query.trim()
    if (q.length < 2) { setPeople([]); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`/api/nurture?action=search&q=${encodeURIComponent(q)}`, { headers: await authHeader() })
        const data = await r.json()
        setPeople(data.people || [])
      } catch (e) { setPeople([]) }
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer.current)
  }, [query])

  function pick(p) {
    setPerson(p); setStep('form'); setM(false); setWhy(''); setO(false); setI(false); setOutcome(null); setError('')
    setTf(p.timeframeId || null)
  }

  const mDone = m && why.trim().length > 0
  const fDone = !!outcome && !!tf
  const count = [mDone, o, !!tf, i, fDone].filter(Boolean).length
  const ready = count === 5 && !saving

  const resultFor = id => {
    if (!person) return ''
    const ns = nextStage(person.stage, id)
    return ns ? `Moves to ${ns}` : `Stage stays ${person.stage || 'as is'}`
  }
  const finalStage = person && outcome ? (nextStage(person.stage, outcome) || person.stage) : null
  const showCadence = !!tf && (finalStage || '').toLowerCase() === 'nurture'

  async function save() {
    if (!ready) return
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/nurture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ action: 'save', personId: person.id, why: why.trim(), opportunity: o, info: i, timeframeId: tf, outcome, source: 'command_center' }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Couldn’t save. Try again.')
      setResult(data); setStep('saved'); onSaved && onSaved(data)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  function reset() {
    setStep('pick'); setQuery(''); setPeople([]); setPerson(null); setResult(null); setError('')
  }

  const headers = { pick: ['Log a nurture', 'Step 1 of 2 · pick the person'], form: ['MOTIF', 'Step 2 of 2 · all five to count it'], saved: ['Done', 'Win the Day updated'] }

  return (
    <div style={s.overlay} role="dialog" aria-modal="true" aria-label="Log a nurture">
      <div style={s.sheet}>
        <div style={s.header}>
          {step === 'form' && (
            <button aria-label="Back" onClick={() => setStep('pick')} style={s.iconBtn}><i className="ti ti-chevron-left" aria-hidden="true" /></button>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{headers[step][0]}</div>
            <div style={{ fontSize: 12, color: '#A8A8A8' }}>{headers[step][1]}</div>
          </div>
          <button aria-label="Close" onClick={onClose} style={s.iconBtn}><i className="ti ti-x" aria-hidden="true" /></button>
        </div>

        {step === 'pick' && (
          <div style={s.body}>
            <label htmlFor="motif-who" style={s.label}>Who did you talk to?</label>
            <input id="motif-who" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your Follow Up Boss contacts" style={s.input} />
            {searching && <div style={s.hint}>Searching…</div>}
            {!searching && query.trim().length >= 2 && people.length === 0 && <div style={s.hint}>No matches in your Follow Up Boss contacts.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {people.map(p => (
                <button key={p.id} onClick={() => !p.alreadyNurtured && pick(p)} disabled={p.alreadyNurtured} style={{ ...s.personRow, opacity: p.alreadyNurtured ? 0.55 : 1 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: '#A8A8A8' }}>{p.alreadyNurtured ? 'Already counted in the last 365 days' : (p.stage || 'No stage')}</span>
                  </span>
                  {!p.alreadyNurtured && <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: '#8A8A8A' }} />}
                </button>
              ))}
            </div>
            <div style={s.hint}>Only people in Follow Up Boss can be counted.</div>
          </div>
        )}

        {step === 'form' && person && (
          <>
            <div style={s.body}>
              <div style={s.personCard}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{person.name}</div>
                  <div style={{ fontSize: 12, color: '#A8A8A8' }}>Stage now: {person.stage || 'none'}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: GOLD }}>{count} of 5</div>
              </div>

              <div style={{ ...s.block, borderColor: mDone ? GOLD : '#2a2a2a' }}>
                <Check on={m} onClick={() => setM(!m)} letter="M" title="Motivation" sub="I know why they want to move, three deep" />
                <label htmlFor="motif-why" style={{ ...s.label, fontSize: 12 }}>Why are they moving?</label>
                <input id="motif-why" value={why} onChange={e => setWhy(e.target.value)} placeholder="New job, kids start school in August, wants to be settled first" style={{ ...s.input, height: 44, fontSize: 13, background: '#0A0A0A' }} />
              </div>

              <div style={{ ...s.block, borderColor: o ? GOLD : '#2a2a2a' }}>
                <Check on={o} onClick={() => setO(!o)} letter="O" title="Opportunity" sub="Not working with another agent" />
              </div>

              <div style={{ ...s.block, borderColor: tf ? GOLD : '#2a2a2a' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}><span style={{ color: GOLD }}>T</span>  Timeline</div>
                  <div style={{ fontSize: 12, color: '#A8A8A8' }}>Their timeframe in Follow Up Boss</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {timeframes.map(t => {
                    const on = tf === t.id
                    return (
                      <button key={t.id} onClick={() => setTf(t.id)} aria-pressed={on} style={{ ...s.chip, borderColor: on ? GOLD : '#444', background: on ? GOLD : 'transparent', color: on ? '#0A0A0A' : '#FFFFFF' }}>{t.name}</button>
                    )
                  })}
                </div>
              </div>

              <div style={{ ...s.block, borderColor: i ? GOLD : '#2a2a2a' }}>
                <Check on={i} onClick={() => setI(!i)} letter="I" title="Info" sub="Phone and email confirmed" />
              </div>

              <div style={{ ...s.block, borderColor: fDone ? GOLD : '#2a2a2a' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}><span style={{ color: GOLD }}>F</span>  Follow-up</div>
                  <div style={{ fontSize: 12, color: '#A8A8A8' }}>Where did this conversation land?</div>
                </div>
                {OUTCOMES.map(x => {
                  const on = outcome === x.id
                  return (
                    <button key={x.id} onClick={() => setOutcome(x.id)} aria-pressed={on} style={{ ...s.outcome, borderColor: on ? GOLD : '#333', background: on ? 'rgba(201,168,76,0.12)' : 'transparent' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: on ? GOLD : '#FFFFFF' }}>{x.name}</span>
                      <span style={{ fontSize: 12, color: '#A8A8A8' }}>{resultFor(x.id)}</span>
                    </button>
                  )
                })}
                {showCadence && <div style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>Follow-up: {CADENCE[tf] || ''} · lands on {LISTS[tf] || 'your nurture list'}</div>}
              </div>
            </div>
            <div style={s.footer}>
              {error && <div style={s.error}>{error}</div>}
              <button onClick={save} disabled={!ready} style={{ ...s.primary, background: ready ? GOLD : '#2a2a2a', color: ready ? '#0A0A0A' : '#8A8A8A', cursor: ready ? 'pointer' : 'default' }}>
                {saving ? 'Saving…' : 'Save nurture'}
              </button>
              <div style={{ ...s.hint, textAlign: 'center' }}>
                {count === 5 ? 'Saves the nurture and updates Follow Up Boss.' : (m && !why.trim() ? 'Add why they’re moving to finish Motivation.' : 'Check all five to save.')}
              </div>
            </div>
          </>
        )}

        {step === 'saved' && result && (
          <div style={s.body}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>Nurture saved</div>
              <div style={{ fontSize: 14, color: '#CFCFCF', marginTop: 4 }}>{result.person} counts toward this week.</div>
            </div>
            <WeekBoxes total={result.week.total} />
            <div style={s.card}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Updated in Follow Up Boss</div>
              <Row k="Stage" v={result.stageChanged ? `${result.stageBefore || 'none'} to ${result.stageAfter}` : `${result.stageAfter || 'none'} (no change)`} />
              {result.timeframe && <Row k="Timeframe" v={result.timeframe} />}
              {result.smartList && <Row k="Smart list" v={result.smartList} gold />}
              <Row k="Note" v={result.writtenAs === 'agent' ? 'Added, written by you' : 'Added, with your name on the first line'} />
            </div>
            {result.appointment && (
              <div style={{ ...s.card, border: `1px solid ${GOLD}`, background: 'transparent' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Did you create the deal in Follow Up Boss?</div>
                <div style={{ fontSize: 12, color: '#CFCFCF', lineHeight: 1.5 }}>The deal should be created at Appointment set, so it counts on Win the Day.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={onClose} style={{ ...s.primary, flex: 1, height: 44, background: GOLD, color: '#0A0A0A' }}>Yes, it’s in</button>
                  <a href="https://app.followupboss.com" target="_blank" rel="noreferrer" style={s.secondaryLink}>Not yet · open FUB</a>
                </div>
              </div>
            )}
            <button onClick={reset} style={s.secondary}>Log another nurture</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Check({ on, onClick, letter, title, sub }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: 0, background: 'transparent', border: 'none', color: '#FFFFFF', textAlign: 'left', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}>
      <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: `1.5px solid ${on ? GOLD : '#666'}`, background: on ? GOLD : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0A0A0A' }}>
        {on && <i className="ti ti-check" aria-hidden="true" style={{ fontSize: 16, fontWeight: 700 }} />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}><span style={{ color: GOLD }}>{letter}</span>  {title}</span>
        <span style={{ fontSize: 12, color: '#A8A8A8' }}>{sub}</span>
      </span>
    </button>
  )
}

function Row({ k, v, gold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
      <span style={{ color: '#A8A8A8' }}>{k}</span>
      <span style={{ textAlign: 'right', color: gold ? GOLD : '#FFFFFF', fontWeight: gold ? 600 : 400 }}>{v}</span>
    </div>
  )
}

export function WeekBoxes({ total }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const shown = Math.min(total, 15)
  return (
    <div style={s.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>This week</span>
        <span style={{ fontSize: 13, color: GOLD, fontWeight: 700 }}>{total} of 15</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
        {days.map((d, di) => (
          <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[0, 1, 2].map(k => {
                const filled = di * 3 + k < shown
                return <span key={k} style={{ width: 14, height: 14, borderRadius: 3, background: filled ? GOLD : 'transparent', border: `1px solid ${filled ? GOLD : '#444'}` }} />
              })}
            </div>
            <span style={{ fontSize: 11, color: '#A8A8A8' }}>{d}</span>
          </div>
        ))}
      </div>
      {total >= 15 && <div style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>Friday morning earned.{total > 15 ? ` ${total - 15} carry into next week.` : ''}</div>}
    </div>
  )
}

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 },
