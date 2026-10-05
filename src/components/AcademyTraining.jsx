import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { isTrainingDone } from './academyUtils'

const pct = x => `${Math.round((x || 0) * 100)}%`
const shuffle = arr => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export default function AcademyTraining({
  training: t, section, resources, progress: p, programTrainings, progressMap,
  onProgressChange, backView, backLabel, onNavigate,
}) {
  const [savingWatched, setSavingWatched] = useState(false)
  const [quiz, setQuiz] = useState(null)
  const [copied, setCopied] = useState(false)

  // First time this training is opened, record it (used for pace reporting).
  useEffect(() => {
    if (p?.first_opened_at) return
    supabase.rpc('academy_mark_opened', { p_training_id: t.id }).then(() => onProgressChange())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id])

  const done = isTrainingDone(t, p)
  const othersPassed = programTrainings.filter(x => !x.is_final).every(x => progressMap[x.id]?.passed_at)
  const canQuiz = t.is_final ? othersPassed : !!p?.watched_at
  const passMarkText = `${Math.round(Number(t.pass_mark) * 100)}%`

  async function toggleWatched(e) {
    const checked = e.target.checked
    setSavingWatched(true)
    await supabase.rpc('academy_mark_watched', { p_training_id: t.id, p_watched: checked })
    await onProgressChange()
    setSavingWatched(false)
  }

  async function startQuiz() {
    setQuiz({ status: 'loading' })
    const { data, error } = await supabase.rpc('academy_get_quiz', { p_training_id: t.id })
    if (error) {
      const m = error.message || ''
      setQuiz({
        status: 'error',
        message: m.includes('watch_first') ? 'Check "I watched it" first to unlock the quiz.'
          : m.includes('final_locked') ? 'The final assessment unlocks once every module above is complete.'
          : 'The quiz could not load. Refresh the page and try again.',
      })
      return
    }
    // Shuffle answer options every attempt. The final also shuffles question order.
    const qs = (data || []).map(q => ({ ...q, optionOrder: shuffle(q.options.map((_, i) => i)) }))
    setQuiz({
      status: 'ready',
      key: Date.now(),
      startedAt: new Date().toISOString(),
      questions: t.is_final ? shuffle(qs) : qs,
      answers: {},
      missing: [],
      result: null,
      submitting: false,
      submitError: '',
    })
  }

  function choose(qid, originalIndex) {
    setQuiz(q => ({ ...q, answers: { ...q.answers, [qid]: originalIndex }, missing: q.missing.filter(id => id !== qid) }))
  }

  async function submitQuiz() {
    const missing = quiz.questions.filter(q => quiz.answers[q.question_id] === undefined).map(q => q.question_id)
    if (missing.length) { setQuiz(q => ({ ...q, missing })); return }
    setQuiz(q => ({ ...q, submitting: true, submitError: '' }))
    // Always submit the ORIGINAL option index, never the shuffled position.
    const answers = quiz.questions.map(q => ({ question_id: q.question_id, chosen_index: quiz.answers[q.question_id] }))
    const { data, error } = await supabase.rpc('academy_submit_quiz', {
      p_training_id: t.id, p_answers: answers, p_started_at: quiz.startedAt,
    })
    if (error) {
      setQuiz(q => ({ ...q, submitting: false, submitError: 'Your answers could not be submitted. Check your connection and try again.' }))
      return
    }
    setQuiz(q => ({ ...q, submitting: false, result: data }))
    onProgressChange()
  }

  function copyPasscode() {
    navigator.clipboard?.writeText(t.zoom_passcode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  const videoSrc = t.loom_id ? `https://www.loom.com/embed/${t.loom_id}`
    : t.youtube_id ? `https://www.youtube.com/embed/${t.youtube_id}` : null
  const meta = [
    t.recorded_on ? `Recorded ${fmtDate(t.recorded_on)}` : null,
    t.video_minutes ? `${t.video_minutes} minutes` : null,
  ].filter(Boolean).join('. ')

  return (
    <div style={styles.page}>
      <div style={styles.crumb}>
        <button type="button" onClick={() => onNavigate(backView)} style={styles.crumbLink}>{backLabel}</button>
        {section && <span> / {section.title}</span>}
      </div>
      <h1 style={styles.title}>
        {t.title}
        {done && (
          <span style={styles.completeBadge}>
            <i className="ti ti-circle-check" aria-hidden="true" style={{ fontSize: '17px' }} /> Complete
          </span>
        )}
      </h1>
      {meta && <p style={styles.meta}>{meta}.</p>}

      {videoSrc && (
        <div style={styles.videoWrap}>
          <iframe
            src={videoSrc}
            title={t.title}
            style={styles.iframe}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      )}
      {!videoSrc && t.zoom_url && (
        <div style={styles.zoomRow}>
          <a href={t.zoom_url} target="_blank" rel="noopener noreferrer" style={styles.goldBtn}>
            <i className="ti ti-player-play" aria-hidden="true" /> Watch recording
          </a>
          {t.zoom_passcode && (
            <span style={styles.passBox}>
              Passcode <code style={styles.passCode}>{t.zoom_passcode}</code>
              <button type="button" onClick={copyPasscode} style={styles.copyBtn}>
                <i className="ti ti-copy" aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
              </button>
            </span>
          )}
        </div>
      )}

      {t.description && <p style={styles.description}>{t.description}</p>}
      {t.agent_note && <div style={styles.note}>{t.agent_note}</div>}

      {t.learn_points && t.learn_points.length > 0 && (
        <div style={styles.block}>
          <h2 style={styles.h2}>What you'll learn</h2>
          <ul style={styles.learnList}>
            {t.learn_points.map((point, i) => (
              <li key={i} style={styles.learnItem}>
                <span style={styles.learnDot} />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resources.length > 0 && (
        <div style={styles.block}>
          <h2 style={styles.h2}>Resources</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {resources.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => window.open(r.file_url, '_blank', 'noopener,noreferrer')}
                style={styles.resourceLink}
              >
                <i className="ti ti-file-download" aria-hidden="true" style={{ fontSize: '18px', color: '#C9A84C' }} />
                <span style={{ flex: 1 }}>{r.label}</span>
                <span style={{ fontSize: '11px', color: '#777' }}>PDF</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(section || t.is_final) && (
        <>
          <div style={styles.actions}>
            {!t.is_final && (
              <label
                style={{ ...styles.check, ...(p?.passed_at ? { color: '#888', cursor: 'default' } : {}) }}
                title={p?.passed_at ? 'Locked because you passed this training.' : undefined}
              >
                <input
                  type="checkbox"
                  checked={!!p?.watched_at}
                  disabled={!!p?.passed_at || savingWatched}
                  onChange={toggleWatched}
                  style={{ width: '20px', height: '20px', accentColor: '#C9A84C', margin: 0 }}
                />
                I watched it
              </label>
            )}
            {(!quiz || quiz.status === 'error') && (
              <button type="button" onClick={startQuiz} disabled={!canQuiz} style={{ ...styles.goldBtn, ...(canQuiz ? {} : styles.btnDisabled) }}>
                {t.is_final ? (p?.passed_at ? 'Retake the final assessment' : 'Take the final assessment')
                  : (p?.passed_at ? 'Retake the quiz' : 'Take the quiz')}
              </button>
            )}
          </div>
          <p style={styles.status}><StatusLine t={t} p={p} othersPassed={othersPassed} programTrainings={programTrainings} progressMap={progressMap} /></p>
          {!canQuiz && !quiz && (
            <div style={styles.msg}>
              {t.is_final ? 'The final assessment unlocks once every module above is complete.'
                : 'Watch the recording and check "I watched it" to unlock the quiz.'}
            </div>
          )}
          {quiz?.status === 'error' && <div style={styles.msg}>{quiz.message}</div>}
          {quiz?.status === 'loading' && <p style={styles.status}>Loading the quiz...</p>}
          {quiz?.status === 'ready' && (
            <Quiz
              quiz={quiz}
              training={t}
              passMarkText={passMarkText}
              onChoose={choose}
              onSubmit={submitQuiz}
              onRetake={startQuiz}
            />
          )}
        </>
      )}
    </div>
  )
}

function StatusLine({ t, p, othersPassed, programTrainings, progressMap }) {
  if (t.is_final) {
    if (p?.passed_at) return <><b style={{ color: '#fff' }}>Onboarding complete.</b> Best score {pct(p.best_score)}.</>
    if (!othersPassed) {
      const left = programTrainings.filter(x => !x.is_final && !isTrainingDone(x, progressMap[x.id])).length
      return <>Unlocks after you complete every module above. {left} to go.</>
    }
    if (p?.attempts) return <>Best score so far: {pct(p.best_score)}. You need 100%. Retake the final assessment.</>
    return <>Unlocked. You're ready.</>
  }
  if (p?.passed_at) return <><b style={{ color: '#fff' }}>Complete.</b> Best score {pct(p.best_score)}.</>
  if (p?.attempts) return <>Best score so far: {pct(p.best_score)}. You need {Math.round(Number(t.pass_mark) * 100)}% to complete it. Retake the quiz.</>
  if (p?.watched_at) return <>Watched. Your quiz is ready.</>
  return <>Not started.</>
}

function Quiz({ quiz, training: t, passMarkText, onChoose, onSubmit, onRetake }) {
  const res = quiz.result
  const byId = {}
  ;(res?.results || []).forEach(r => { byId[r.question_id] = r })
  const retakeLabel = t.is_final ? 'Retake the final assessment' : 'Retake the quiz'

  return (
    <div style={styles.quiz}>
      <div aria-live="polite">
        {res && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '14px', color: '#e6e6e6', marginBottom: '12px' }}>
              <strong style={{ fontSize: '22px', color: res.passed ? '#C9A84C' : '#e07070', marginRight: '8px' }}>{res.correct}/{res.total}</strong>
              {res.passed
                ? (t.is_final ? 'Perfect score. Onboarding complete. Go change some lives.' : 'Passed. On to the next one.')
                : (t.is_final ? `This one takes ${passMarkText}. Review the trainings flagged below, then retake it.` : `You need ${passMarkText} to complete this module. Review what you missed, then retake the quiz.`)}
            </p>
            {!res.passed && <button type="button" onClick={onRetake} style={styles.goldBtn}>{retakeLabel}</button>}
          </div>
        )}
        {!res && quiz.missing.length > 0 && (
          <p style={{ fontSize: '14px', color: '#e07070', marginBottom: '14px' }}>Answer all {quiz.questions.length} questions to see your score.</p>
        )}
      </div>

      {quiz.questions.map((q, pos) => {
        const r = byId[q.question_id]
        const name = `${quiz.key}-${q.question_id}`
        const isMissing = !res && quiz.missing.includes(q.question_id)
        return (
          <fieldset key={q.question_id} style={styles.fieldset}>
            <legend style={styles.legend}>{pos + 1}. {q.prompt}</legend>
            {q.optionOrder.map(oi => {
              const chosen = quiz.answers[q.question_id] === oi
              const showRight = r && !r.correct && oi === r.correct_index
              const showWrong = r && !r.correct && oi === r.chosen_index
              return (
                <label
                  key={oi}
                  style={{
                    ...styles.opt,
                    ...(res ? { cursor: 'default' } : {}),
                    ...(showRight ? styles.optRight : {}),
                    ...(showWrong ? styles.optWrong : {}),
                  }}
                >
                  <input
                    type="radio"
                    name={name}
                    checked={chosen}
                    disabled={!!res || quiz.submitting}
                    onChange={() => onChoose(q.question_id, oi)}
                    style={{ marginTop: '4px', accentColor: '#C9A84C', flex: 'none' }}
                  />
                  <span>{q.options[oi]}</span>
                  {showWrong && <span style={styles.optLabel}>Your answer</span>}
                  {showRight && <span style={{ ...styles.optLabel, color: '#C9A84C' }}>Correct answer</span>}
                </label>
              )
            })}
            {isMissing && <p style={{ ...styles.fb, borderLeftColor: '#e07070', color: '#e07070' }}>Choose an answer.</p>}
            {r && (
              <p style={{ ...styles.fb, ...(r.correct ? styles.fbOk : {}) }}>
                {!r.correct && t.is_final && r.review && <b style={{ color: '#fff' }}>Review: {r.review}. </b>}
                {r.explanation}
              </p>
            )}
          </fieldset>
        )
      })}

      {!res && (
        <>
          {quiz.submitError && <p style={{ fontSize: '13px', color: '#e07070', marginBottom: '10px' }}>{quiz.submitError}</p>}
          <button type="button" onClick={onSubmit} disabled={quiz.submitting} style={styles.goldBtn}>
            {quiz.submitting ? 'Checking...' : 'Check my answers'}
          </button>
        </>
      )}
      {res && !res.passed && <button type="button" onClick={onRetake} style={styles.goldBtn}>{retakeLabel}</button>}
    </div>
  )
}

const styles = {
  page: { padding: '28px 32px 80px', maxWidth: '780px' },
  crumb: { fontSize: '12px', color: '#777', marginBottom: '6px', fontFamily: 'Montserrat, sans-serif' },
  crumbLink: { background: 'none', border: 'none', padding: 0, color: '#C9A84C', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  title: { fontSize: '22px', fontWeight: '700', color: '#FFFFFF', letterSpacing: '-0.3px' },
  completeBadge: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '600', color: '#C9A84C', marginLeft: '10px', verticalAlign: 'middle', letterSpacing: 0 },
  meta: { fontSize: '13px', color: '#888', marginTop: '6px' },
  videoWrap: { position: 'relative', width: '100%', paddingBottom: '56.25%', borderRadius: '10px', overflow: 'hidden', background: '#1E1E1E', border: '0.5px solid #2a2a2a', marginTop: '20px' },
  iframe: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' },
  zoomRow: { marginTop: '20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' },
  passBox: { display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#aaa', padding: '8px 12px', background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '8px' },
  passCode: { fontFamily: 'Montserrat, sans-serif', fontWeight: '600', color: '#fff', letterSpacing: '0.3px' },
  copyBtn: { background: 'none', border: 'none', color: '#C9A84C', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'Montserrat, sans-serif' },
  description: { fontSize: '14px', color: '#aaaaaa', lineHeight: 1.7, marginTop: '18px' },
  note: { marginTop: '16px', padding: '12px 16px', background: 'rgba(201,168,76,0.12)', borderLeft: '3px solid #C9A84C', borderRadius: '0 8px 8px 0', fontSize: '13px', color: '#e6e6e6', lineHeight: 1.6 },
  block: { marginTop: '24px' },
  h2: { fontSize: '15px', fontWeight: '700', color: '#ffffff', marginBottom: '10px' },
  learnList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '9px' },
  learnItem: { display: 'flex', gap: '10px', fontSize: '13px', color: '#cccccc', lineHeight: 1.6 },
  learnDot: { width: '6px', height: '6px', borderRadius: '50%', background: '#C9A84C', marginTop: '8px', flexShrink: 0 },
  resourceLink: { display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '8px', color: '#ffffff', fontSize: '13px', fontWeight: '500', cursor: 'pointer', textAlign: 'left', fontFamily: 'Montserrat, sans-serif' },
  actions: { marginTop: '26px', paddingTop: '22px', borderTop: '0.5px solid #2a2a2a', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' },
  check: { display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: '500', color: '#ffffff', cursor: 'pointer', minHeight: '42px', fontFamily: 'Montserrat, sans-serif' },
  goldBtn: { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 18px', background: '#C9A84C', color: '#0A0A0A', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', letterSpacing: '0.3px', cursor: 'pointer', textDecoration: 'none', fontFamily: 'Montserrat, sans-serif' },
  btnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  status: { marginTop: '12px', fontSize: '13px', color: '#aaaaaa' },
  msg: { marginTop: '14px', padding: '12px 16px', borderRadius: '8px', background: '#1E1E1E', border: '0.5px solid #2a2a2a', fontSize: '13px', color: '#aaaaaa' },
  quiz: { marginTop: '20px', background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '10px', padding: '22px' },
  fieldset: { border: 0, margin: '0 0 22px', padding: 0 },
  legend: { fontWeight: '600', fontSize: '14px', color: '#ffffff', marginBottom: '10px', padding: 0 },
  opt: { display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '9px 12px', borderRadius: '7px', cursor: 'pointer', fontSize: '14px', color: '#e6e6e6' },
  optRight: { background: 'rgba(201,168,76,0.22)', boxShadow: 'inset 4px 0 0 #C9A84C', color: '#ffffff' },
  optWrong: { background: 'rgba(224,112,112,0.12)', boxShadow: 'inset 3px 0 0 #e07070', color: '#e07070' },
  optLabel: { marginLeft: 'auto', paddingLeft: '12px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' },
  fb: { fontSize: '13px', margin: '8px 0 0 12px', paddingLeft: '12px', borderLeft: '3px solid #C9A84C', color: '#e6e6e6', lineHeight: 1.6 },
  fbOk: { borderLeftColor: '#333', color: '#999' },
}
