import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Shown only to admin and leader accounts (Academy.jsx checks profile.account_type).
// The views it reads also enforce this on the server: agents only ever get their own rows.

const FLAG_LABEL = {
  watched_too_fast: 'Watched too fast',
  quiz_too_fast: 'Quiz too fast',
  repeated_fails: '3 or more fails',
}
const stamp = d => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
const day = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
const pct = x => x == null ? '' : `${Math.round(Number(x) * 100)}%`

export default function AcademyLeadership({ programTrainings }) {
  const [tab, setTab] = useState('agents')
  const [summary, setSummary] = useState(null)
  const [flags, setFlags] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [names, setNames] = useState({})
  const [selected, setSelected] = useState(null)
  const [timeline, setTimeline] = useState(null)

  const moduleCount = programTrainings.filter(t => !t.is_final).length

  useEffect(() => {
    let alive = true
    async function load() {
      const [s, f, q, pr] = await Promise.all([
        supabase.from('academy_agent_summary').select('*').order('last_name'),
        supabase.from('academy_speed_flags').select('*').order('flagged_at', { ascending: false }),
        supabase.from('academy_question_stats').select('*').order('miss_rate_pct', { ascending: false, nullsFirst: false }).order('times_missed', { ascending: false }),
        supabase.from('profiles').select('id, first_name, last_name'),
      ])
      if (!alive) return
      setSummary(s.data || [])
      setFlags(f.data || [])
      setQuestions(q.data || [])
      const map = {}
      ;(pr.data || []).forEach(x => { map[x.id] = `${x.first_name ?? ''} ${x.last_name ?? ''}`.trim() })
      setNames(map)
    }
    load()
    return () => { alive = false }
  }, [])

  async function openAgent(id) {
    if (selected === id) { setSelected(null); setTimeline(null); return }
    setSelected(id)
    setTimeline(null)
    const { data } = await supabase.from('academy_agent_timeline').select('*').eq('user_id', id).order('order_index')
    setTimeline(data || [])
  }

  return (
    <section style={styles.wrap}>
      <h2 style={styles.h2}>
        Team Progress <span style={styles.tag}>Admins and leaders only</span>
      </h2>
      <div style={styles.tabs} role="tablist">
        {[['agents', 'Agents'], ['flags', 'Speed flags'], ['questions', 'Question report']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ ...styles.tab, ...(tab === k ? styles.tabActive : {}) }}>{label}</button>
        ))}
      </div>

      {tab === 'agents' && (
        summary === null ? <p style={styles.note}>Loading...</p> : summary.length === 0 ? (
          <div style={styles.tableWrap}><p style={styles.empty}>No agent accounts yet.</p></div>
        ) : (
          <>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead><tr>{['Agent', 'Watched', 'Passed', 'Final', 'Avg first try', 'Avg attempts to pass', 'Started', 'Last active', 'Days in onboarding'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {summary.map(r => (
                    <tr key={r.user_id} onClick={() => openAgent(r.user_id)} style={{ cursor: 'pointer', background: selected === r.user_id ? 'rgba(201,168,76,0.12)' : 'transparent' }}>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}><b>{r.first_name} {r.last_name}</b></td>
                      <td style={styles.tdNum}>{r.trainings_watched} of {moduleCount}</td>
                      <td style={styles.tdNum}>{r.trainings_passed} of {moduleCount}</td>
                      <td style={styles.td}>{r.final_passed ? 'Passed' : 'Not yet'}</td>
                      <td style={styles.tdNum}>{r.avg_first_try_pct == null ? 'None yet' : `${r.avg_first_try_pct}%`}</td>
                      <td style={styles.tdNum}>{r.avg_attempts_to_pass == null ? 'None yet' : r.avg_attempts_to_pass}</td>
                      <td style={styles.tdNum}>{r.started_at ? day(r.started_at) : 'Not started'}</td>
                      <td style={styles.tdNum}>{day(r.last_active_at)}</td>
                      <td style={styles.tdNum}>{r.started_at ? r.days_in_onboarding : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!selected && <p style={styles.note}>Click an agent to see their training timeline.</p>}
            {selected && (
              <div style={styles.detail}>
                <h3 style={styles.h3}>{names[selected] || 'Agent'}: training timeline</h3>
                {timeline === null ? <p style={styles.note}>Loading...</p> : timeline.length === 0 ? (
                  <p style={styles.note}>This agent hasn't opened any trainings yet.</p>
                ) : (
                  <div style={styles.tableWrap}>
                    <table style={styles.table}>
                      <thead><tr>{['Training', 'Opened', 'Watched', 'Open to watched vs video', 'First try', 'Best', 'Attempts', 'Passed', 'Open to passed'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {timeline.map(r => {
                          const fast = r.minutes_open_to_watched != null && r.video_minutes && r.minutes_open_to_watched < r.video_minutes * 0.5
                          return (
                            <tr key={r.training}>
                              <td style={styles.td}>{r.training}</td>
                              <td style={styles.tdNum}>{stamp(r.first_opened_at)}</td>
                              <td style={styles.tdNum}>{stamp(r.watched_at)}</td>
                              <td style={{ ...styles.tdNum, ...(fast ? { color: '#e07070', fontWeight: 600 } : {}) }}>
                                {r.minutes_open_to_watched == null ? '' : `${r.minutes_open_to_watched} min${r.video_minutes ? ` of ${r.video_minutes}` : ''}`}
                              </td>
                              <td style={styles.tdNum}>{pct(r.first_score)}</td>
                              <td style={styles.tdNum}>{pct(r.best_score)}</td>
                              <td style={styles.tdNum}>{r.attempts}</td>
                              <td style={styles.tdNum}>{stamp(r.passed_at)}</td>
                              <td style={styles.tdNum}>{r.hours_open_to_passed == null ? '' : `${r.hours_open_to_passed} hrs`}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )
      )}

      {tab === 'flags' && (
        <>
          {flags === null ? <p style={styles.note}>Loading...</p> : flags.length === 0 ? (
            <div style={styles.tableWrap}><p style={styles.empty}>No flags yet.</p></div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead><tr>{['Agent', 'Training', 'Flag', 'Detail', 'When'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {flags.map((f, i) => (
                    <tr key={i}>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{names[f.user_id] || 'Agent'}</td>
                      <td style={styles.td}>{f.training}</td>
                      <td style={{ ...styles.td, color: '#e07070', fontWeight: 600, whiteSpace: 'nowrap' }}>{FLAG_LABEL[f.flag] || f.flag}</td>
                      <td style={styles.td}>{f.detail}</td>
                      <td style={styles.tdNum}>{stamp(f.flagged_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={styles.note}>Flags trigger when "I watched it" is checked in under half the video length, a quiz is submitted in under 60 seconds (retakes after passing don't count), or a training has 3 or more failed attempts.</p>
        </>
      )}

      {tab === 'questions' && (
        questions === null ? <p style={styles.note}>Loading...</p> : questions.length === 0 ? (
          <div style={styles.tableWrap}><p style={styles.empty}>No quiz attempts yet.</p></div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead><tr>{['Miss rate', 'Training', 'Question', 'Answered', 'Missed'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {questions.map((q, i) => (
                  <tr key={i}>
                    <td style={styles.tdNum}><b>{q.miss_rate_pct ?? 0}%</b></td>
                    <td style={styles.td}>{q.training}</td>
                    <td style={styles.td}>Q{q.order_index}. {q.prompt}</td>
                    <td style={styles.tdNum}>{q.times_answered}</td>
                    <td style={styles.tdNum}>{q.times_missed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  )
}

const styles = {
  wrap: { marginTop: '44px', paddingTop: '28px', borderTop: '0.5px solid #2a2a2a' },
  h2: { fontSize: '17px', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.2px' },
  h3: { fontSize: '14px', fontWeight: '700', color: '#ffffff', marginBottom: '10px' },
  tag: { display: 'inline-block', fontSize: '11px', fontWeight: '600', color: '#C9A84C', border: '0.5px solid rgba(201,168,76,0.5)', borderRadius: '20px', padding: '2px 10px', marginLeft: '8px', verticalAlign: 'middle', letterSpacing: 0 },
  tabs: { display: 'flex', gap: '6px', margin: '16px 0 14px', flexWrap: 'wrap' },
  tab: { padding: '6px 14px', borderRadius: '20px', border: '0.5px solid #333', background: 'transparent', color: '#888', fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  tabActive: { border: '0.5px solid #C9A84C', color: '#C9A84C', background: 'rgba(201,168,76,0.08)' },
  tableWrap: { overflowX: 'auto', background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '10px' },
  table: { borderCollapse: 'collapse', width: '100%', minWidth: '660px', fontSize: '13px', color: '#e6e6e6' },
  th: { textAlign: 'left', padding: '11px 14px', borderBottom: '0.5px solid #2a2a2a', fontWeight: '600', fontSize: '12px', color: '#888' },
  td: { textAlign: 'left', padding: '11px 14px', borderBottom: '0.5px solid #232323', verticalAlign: 'top' },
  tdNum: { textAlign: 'left', padding: '11px 14px', borderBottom: '0.5px solid #232323', verticalAlign: 'top', whiteSpace: 'nowrap' },
  note: { fontSize: '12px', color: '#777', marginTop: '10px' },
  empty: { padding: '18px 16px', fontSize: '13px', color: '#888' },
  detail: { marginTop: '18px' },
}
