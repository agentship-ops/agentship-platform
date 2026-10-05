import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import AcademyTraining from './AcademyTraining'
import AcademyLeadership from './AcademyLeadership'
import { isTrainingDone } from './academyUtils'

// View ids used by the sidebar and Dashboard:
//   academy-onboarding            Collective page
//   academy-library               Training Library page
//   academy-onboarding:<slug>     a training inside Collective
//   academy-library:<slug>        a training, opened from the library
export const ONBOARDING_VIEW = 'academy-onboarding'
export const LIBRARY_VIEW = 'academy-library'
const PROGRAM_SLUG = 'collective-onboarding'

export default function Academy({ view, onNavigate }) {
  const { user, profile } = useAuth()
  const [content, setContent] = useState(null)
  const [progress, setProgress] = useState({})
  const [loadError, setLoadError] = useState('')

  const isLeader = profile?.account_type === 'admin' || profile?.account_type === 'leader'

  const userId = user?.id
  const loadProgress = useCallback(async () => {
    if (!userId) return
    // RLS returns everyone's rows to leaders, so always filter to the signed-in user here.
    const { data } = await supabase.from('training_progress').select('*').eq('user_id', userId)
    const map = {}
    ;(data || []).forEach(r => { map[r.training_id] = r })
    setProgress(map)
    // Lets the sidebar refresh its gold checks.
    window.dispatchEvent(new Event('academy-progress-changed'))
  }, [userId])

  useEffect(() => {
    let alive = true
    async function load() {
      const [programs, sections, trainings, resources] = await Promise.all([
        supabase.from('training_programs').select('*').eq('is_active', true).order('order_index'),
        supabase.from('training_sections').select('*').order('order_index'),
        supabase.from('trainings')
          .select('id, slug, title, description, loom_id, youtube_id, learn_points, section_id, order_index, recorded_on, video_minutes, zoom_url, zoom_passcode, agent_note, pass_mark, is_final, is_active, in_library')
          .eq('is_active', true).order('order_index'),
        supabase.from('training_resources').select('*').order('created_at'),
      ])
      if (!alive) return
      const err = programs.error || sections.error || trainings.error || resources.error
      if (err) { setLoadError('The Academy could not load. Refresh the page to try again.'); return }
      setContent({ programs: programs.data, sections: sections.data, trainings: trainings.data, resources: resources.data })
    }
    load()
    loadProgress()
    return () => { alive = false }
  }, [loadProgress])

  // Each Academy view starts at the top of the page.
  useEffect(() => {
    const main = document.querySelector('main')
    if (main) main.scrollTo(0, 0)
  }, [view])

  if (loadError) return <div style={styles.page}><p style={styles.muted}>{loadError}</p></div>
  if (!content) return <div style={styles.page}><p style={styles.muted}>Loading the Academy...</p></div>

  const program = content.programs.find(p => p.slug === PROGRAM_SLUG)
  const programSections = content.sections.filter(s => program && s.program_id === program.id)
  const sectionIds = new Set(programSections.map(s => s.id))
  const programTrainings = content.trainings
    .filter(t => sectionIds.has(t.section_id))
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  const libraryTrainings = content.trainings.filter(t => t.in_library)

  const [base, slug] = view.split(':')

  if (slug) {
    const training = content.trainings.find(t => t.slug === slug)
    if (!training) return <div style={styles.page}><p style={styles.muted}>That training could not be found.</p></div>
    const fromLibrary = base === LIBRARY_VIEW
    const section = content.sections.find(s => s.id === training.section_id)
    const inProgram = sectionIds.has(training.section_id)
    return (
      <AcademyTraining
        key={training.id}
        training={training}
        section={inProgram ? section : null}
        resources={content.resources.filter(r => r.training_id === training.id)}
        progress={progress[training.id]}
        programTrainings={programTrainings}
        progressMap={progress}
        onProgressChange={loadProgress}
        backView={fromLibrary || !inProgram ? LIBRARY_VIEW : ONBOARDING_VIEW}
        backLabel={fromLibrary || !inProgram ? 'Training Library' : (program?.title || 'Collective')}
        onNavigate={onNavigate}
      />
    )
  }

  if (base === LIBRARY_VIEW) {
    return (
      <div style={styles.page}>
        <div style={styles.crumb}>Agentship Academy</div>
        <h1 style={styles.title}>Training Library</h1>
        <p style={styles.lede}>Every training available to the team. Open one anytime to watch or rewatch it.</p>
        {libraryTrainings.length === 0 ? (
          <p style={styles.muted}>No trainings in the library yet.</p>
        ) : (
          <div style={{ ...styles.rows, marginTop: '22px' }}>
            {libraryTrainings.map(t => (
              <TrainingRow key={t.id} t={t} p={progress[t.id]} onClick={() => onNavigate(`${LIBRARY_VIEW}:${t.slug}`)} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Program page (Collective)
  const done = programTrainings.filter(t => isTrainingDone(t, progress[t.id])).length
  const total = programTrainings.length
  const othersPassed = programTrainings.filter(t => !t.is_final).every(t => progress[t.id]?.passed_at)

  return (
    <div style={styles.page}>
      <div style={styles.crumb}>Agentship Academy</div>
      <h1 style={styles.title}>{program?.title || 'Collective'}</h1>
      {program?.description && <p style={styles.lede}>{program.description}</p>}

      <div style={styles.progressCard}>
        <div style={styles.progressRow}>
          <span style={styles.progressCount}>{done} of {total} complete</span>
          <span style={styles.progressNote}>
            {done === total && total > 0 ? 'Onboarding complete.' : 'Go in order. Each section builds on the one before it.'}
          </span>
        </div>
        <div style={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div style={{ ...styles.fill, width: total ? `${(done / total) * 100}%` : '0%' }} />
        </div>
      </div>

      <div style={styles.how}>
        <div style={styles.howItem}><b style={styles.howTitle}>Watch</b>Go in order. Each phase builds on the one before it.</div>
        <div style={styles.howItem}><b style={styles.howTitle}>Check it off</b>Mark a recording watched once you've finished it. That unlocks its quiz.</div>
        <div style={styles.howItem}><b style={styles.howTitle}>Take the quiz</b>Score 80% or better to complete the module. Miss the mark and you retake it. The final assessment takes 100%. Kalie and Melissa see your progress.</div>
      </div>

      {programSections.map(sec => {
        const items = programTrainings.filter(t => t.section_id === sec.id)
        if (!items.length) return null
        return (
          <section key={sec.id} style={{ marginTop: '34px' }}>
            <h2 style={styles.h2}>{sec.title}</h2>
            {sec.purpose && <p style={styles.purpose}>{sec.purpose}</p>}
            <div style={styles.rows}>
              {items.map(t => (
                <TrainingRow
                  key={t.id}
                  t={t}
                  p={progress[t.id]}
                  number={t.order_index}
                  locked={t.is_final && !othersPassed && !isTrainingDone(t, progress[t.id])}
                  onClick={() => onNavigate(`${ONBOARDING_VIEW}:${t.slug}`)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {isLeader && <AcademyLeadership programTrainings={programTrainings} />}
    </div>
  )
}

function shortStatus(t, p, locked) {
  if (isTrainingDone(t, p)) return `Complete, ${Math.round((p.best_score || 0) * 100)}%`
  if (locked) return 'Locked'
  if (p?.attempts) return `Best ${Math.round((p.best_score || 0) * 100)}%, retake`
  if (t.is_final) return 'Unlocked'
  if (p?.watched_at) return 'Quiz ready'
  if (p?.first_opened_at) return 'Opened'
  return 'Not started'
}

function TrainingRow({ t, p, number, locked, onClick }) {
  const [hover, setHover] = useState(false)
  const done = isTrainingDone(t, p)
  const meta = [
    t.video_minutes ? `${t.video_minutes} min` : null,
    t.is_final ? null : (t.loom_id || t.youtube_id ? 'Video' : t.zoom_url ? 'Zoom recording' : null),
  ].filter(Boolean).join(', ')
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...styles.row, background: hover ? '#242424' : 'transparent' }}
    >
      <span style={{ ...styles.mark, ...(done ? styles.markDone : {}) }}>
        {done ? <i className="ti ti-check" aria-hidden="true" style={{ fontSize: '14px' }} />
          : locked ? <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: '13px' }} />
          : number ? <span style={{ fontSize: '11px', fontWeight: 600 }}>{number}</span>
          : <i className="ti ti-player-play" aria-hidden="true" style={{ fontSize: '13px' }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={styles.rowTitle}>{t.title}</span>
        {meta && <span style={styles.rowMeta}>{meta}</span>}
      </span>
      <span style={styles.rowStatus}>{shortStatus(t, p, locked)}</span>
    </button>
  )
}

const styles = {
  page: { padding: '28px 32px 80px', maxWidth: '820px' },
  crumb: { fontSize: '12px', color: '#777', marginBottom: '6px', fontFamily: 'Montserrat, sans-serif' },
  title: { fontSize: '22px', fontWeight: '700', color: '#FFFFFF', letterSpacing: '-0.3px' },
  lede: { fontSize: '14px', color: '#aaaaaa', lineHeight: 1.7, marginTop: '8px', maxWidth: '62ch' },
  muted: { fontSize: '13px', color: '#777' },
  progressCard: { marginTop: '22px', background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '10px', padding: '18px 20px' },
  progressRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' },
  progressCount: { fontSize: '20px', fontWeight: '700', color: '#C9A84C' },
  progressNote: { fontSize: '12px', color: '#888' },
  track: { height: '6px', borderRadius: '3px', background: '#2d2d2d', marginTop: '12px', overflow: 'hidden' },
  fill: { height: '100%', background: '#C9A84C', borderRadius: '3px', transition: 'width 0.5s ease' },
  how: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '18px', marginTop: '24px' },
  howItem: { fontSize: '13px', color: '#aaaaaa', lineHeight: 1.6 },
  howTitle: { display: 'block', color: '#ffffff', fontWeight: '600', fontSize: '14px', marginBottom: '3px' },
  h2: { fontSize: '17px', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.2px' },
  purpose: { fontSize: '13px', color: '#888', margin: '3px 0 12px' },
  rows: { background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: '14px', width: '100%', padding: '13px 16px', border: 'none', borderBottom: '0.5px solid #2a2a2a', textAlign: 'left', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', color: '#ffffff', transition: 'background 0.1s' },
  mark: { width: '26px', height: '26px', borderRadius: '50%', border: '1.5px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#888' },
  markDone: { background: '#C9A84C', borderColor: '#C9A84C', color: '#0A0A0A' },
  rowTitle: { display: 'block', fontSize: '14px', fontWeight: '600', color: '#ffffff' },
  rowMeta: { display: 'block', fontSize: '12px', color: '#777', marginTop: '1px' },
  rowStatus: { fontSize: '12px', color: '#aaaaaa', flexShrink: 0, textAlign: 'right' },
}
