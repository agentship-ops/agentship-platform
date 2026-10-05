import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { isTrainingDone } from './academyUtils'

// The Agentship Academy part of the sidebar:
//   Collective (dropdown; name comes from training_programs.title)
//     Overview                   (progress page)
//     Foundations / Buyers / ... (each opens its trainings, gold check when complete)
// Academy.jsx fires "academy-progress-changed" whenever progress updates, so the checks stay current.
const PROGRAM_SLUG = 'collective-onboarding'

export default function AcademyNav({ activeView, setActiveView }) {
  const { user } = useAuth()
  const userId = user?.id
  const [content, setContent] = useState(null)
  const [progress, setProgress] = useState({})
  const [open, setOpen] = useState({})

  const loadProgress = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('training_progress').select('training_id, watched_at, passed_at').eq('user_id', userId)
    const map = {}
    ;(data || []).forEach(r => { map[r.training_id] = r })
    setProgress(map)
  }, [userId])

  useEffect(() => {
    let alive = true
    async function load() {
      const [programs, sections, trainings] = await Promise.all([
        supabase.from('training_programs').select('id, slug, title').eq('slug', PROGRAM_SLUG),
        supabase.from('training_sections').select('id, title, order_index, program_id').order('order_index'),
        supabase.from('trainings').select('id, slug, title, section_id, order_index, is_final').eq('is_active', true).order('order_index'),
      ])
      if (!alive) return
      const program = (programs.data || [])[0]
      const secs = (sections.data || []).filter(s => program && s.program_id === program.id)
      const ids = new Set(secs.map(s => s.id))
      setContent({ title: program?.title, sections: secs, trainings: (trainings.data || []).filter(t => ids.has(t.section_id)) })
    }
    load()
    loadProgress()
    window.addEventListener('academy-progress-changed', loadProgress)
    return () => { alive = false; window.removeEventListener('academy-progress-changed', loadProgress) }
  }, [loadProgress])

  const activeSlug = activeView.startsWith('academy-onboarding:') ? activeView.split(':')[1] : null
  const othersPassed = content ? content.trainings.filter(t => !t.is_final).every(t => progress[t.id]?.passed_at) : false

  const inOnboarding = activeView === 'academy-onboarding' || activeView.startsWith('academy-onboarding:')
  const programOpen = open.program ?? inOnboarding

  return (
    <div style={styles.wrap}>
      <button type="button" onClick={() => setOpen(o => ({ ...o, program: !programOpen }))} style={styles.navItem} aria-expanded={programOpen}>
        <i className="ti ti-rocket" aria-hidden="true" style={{ fontSize: '17px', color: '#aaaaaa', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left', color: '#ffffff' }}>{content?.title || 'Collective'}</span>
        <i className="ti ti-chevron-down" aria-hidden="true" style={{ ...styles.chev, transform: programOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
      </button>

      {programOpen && (
        <div style={styles.programList}>
          <button
            type="button"
            onClick={() => setActiveView('academy-onboarding')}
            style={{ ...styles.group, fontWeight: '500', ...(activeView === 'academy-onboarding' ? styles.trainActive : {}) }}
          >
            <span style={{ flex: 1, textAlign: 'left' }}>Overview</span>
          </button>

          {content && content.sections.map(sec => {
            const items = content.trainings.filter(t => t.section_id === sec.id)
            if (!items.length) return null
            const containsActive = items.some(t => t.slug === activeSlug)
            const isOpen = open[sec.id] ?? containsActive
            const done = items.filter(t => isTrainingDone(t, progress[t.id])).length
            return (
              <div key={sec.id}>
                <button type="button" onClick={() => setOpen(o => ({ ...o, [sec.id]: !isOpen }))} style={styles.group} aria-expanded={isOpen}>
                  <span style={{ flex: 1, textAlign: 'left' }}>{sec.title}</span>
                  <span style={styles.count}>{done}/{items.length}</span>
                  <i className="ti ti-chevron-down" aria-hidden="true" style={{ ...styles.chev, transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
                </button>
                {isOpen && (
                  <div style={styles.trainList}>
                    {items.map(t => {
                      const complete = isTrainingDone(t, progress[t.id])
                      const locked = t.is_final && !othersPassed && !complete
                      const active = t.slug === activeSlug
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setActiveView(`academy-onboarding:${t.slug}`)}
                          style={{ ...styles.train, ...(active ? styles.trainActive : {}) }}
                        >
                          <i
                            className={`ti ${complete ? 'ti-circle-check' : locked ? 'ti-lock' : 'ti-player-play'}`}
                            aria-hidden="true"
                            style={{ fontSize: '15px', marginTop: '1px', flexShrink: 0, color: complete ? '#C9A84C' : '#777' }}
                          />
                          <span>{t.title}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '1px' },
  navItem: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 12px',
    borderRadius: '7px', background: 'transparent', border: 'none', fontSize: '14px', fontWeight: '500',
    cursor: 'pointer', textAlign: 'left', fontFamily: 'Montserrat, sans-serif', whiteSpace: 'nowrap',
    marginBottom: '1px', color: '#ffffff',
  },
  navItemActive: { background: '#1E1E1E' },
  group: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
    borderRadius: '7px', background: 'transparent', border: 'none', fontSize: '14px', fontWeight: '600',
    cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', color: '#ffffff', whiteSpace: 'nowrap',
  },
  count: { fontSize: '11px', color: '#777', fontWeight: '500' },
  chev: { fontSize: '13px', color: '#aaaaaa', flexShrink: 0, transition: 'transform 0.2s' },
  programList: {
    marginLeft: '20px', paddingLeft: '8px', borderLeft: '1px solid #2a2a2a',
    display: 'flex', flexDirection: 'column', gap: '1px', marginBottom: '4px',
  },
  trainList: {
    marginLeft: '12px', paddingLeft: '8px', borderLeft: '1px solid #2a2a2a',
    display: 'flex', flexDirection: 'column', gap: '1px', marginBottom: '4px',
  },
  train: {
    width: '100%', display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '8px 10px',
    borderRadius: '7px', background: 'transparent', border: 'none', fontSize: '13px', fontWeight: '500',
    cursor: 'pointer', textAlign: 'left', fontFamily: 'Montserrat, sans-serif', color: '#dddddd', lineHeight: 1.35,
  },
  trainActive: { background: '#1E1E1E', color: '#ffffff' },
}
