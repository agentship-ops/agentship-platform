// Leader Portal > Resource Library.
// The list and the files come from /api/leader-library, which checks Leader
// Portal access and reads each file live from Google Drive. To change what
// shows here, edit rows in the leader_resources table; to update a guide,
// use Manage versions on the file in Drive.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'program', label: 'Program' },
  { id: 'collective', label: 'Collective' },
]

const DIVISION_LABEL = { program: 'Program', collective: 'Collective', both: 'Program and Collective' }

// The Program interview path, shown above the Recruiting and interviewing
// category. A step turns gold when a guide in the library has that step_number.
const INTERVIEW_PATH = [
  { n: 1, name: 'WEIGH Interview', note: 'No guide yet' },
  { n: 2, name: 'KPA Interview', note: 'No guide yet' },
  { n: 3, name: 'See It Live', note: 'Covered at the end of the KPA guide' },
  { n: 4, name: 'Commitment Conversation', note: 'Covered at the end of the KPA guide' },
]
const RECRUITING = 'Recruiting and interviewing'
const NEW_DAYS = 14

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { Authorization: `Bearer ${session.access_token}` } : {}
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ResourceLibrary() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [reader, setReader] = useState(null) // { item, url, loading, error }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/leader-library', { headers: await authHeader() })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || 'Could not load the library.')
        if (!cancelled) setItems(data.resources)
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Free the PDF from memory when the reader closes.
  useEffect(() => () => { if (reader?.url) URL.revokeObjectURL(reader.url) }, [reader?.url])

  useEffect(() => {
    if (!reader) return
    const onKey = e => { if (e.key === 'Escape') setReader(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reader])

  const visible = useMemo(() => {
    if (!items) return []
    const q = query.trim().toLowerCase()
    return items.filter(it => {
      const divOk = tab === 'all' || it.division === tab || it.division === 'both'
      const text = `${it.title} ${it.description || ''} ${(it.sections || []).join(' ')}`.toLowerCase()
      return divOk && (!q || text.includes(q))
    })
  }, [items, tab, query])

  const grouped = useMemo(() => {
    const map = new Map()
    visible.forEach(it => {
      if (!map.has(it.category)) map.set(it.category, [])
      map.get(it.category).push(it)
    })
    return [...map.entries()]
  }, [visible])

  async function open(item) {
    setReader({ item, url: null, loading: true, error: '' })
    try {
      const r = await fetch(`/api/leader-library?id=${encodeURIComponent(item.id)}`, { headers: await authHeader() })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.error || 'Could not open this guide.')
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
      setReader({ item, url, loading: false, error: '' })
    } catch (e) {
      setReader({ item, url: null, loading: false, error: e.message })
    }
  }

  const stepsWithGuide = new Set((items || []).filter(i => i.category === RECRUITING && i.step_number).map(i => i.step_number))

  return (
    <div className="rl-page">
      <style>{CSS}</style>

      <h1 className="rl-title">Resource Library</h1>
      <p className="rl-lede">Agreements, DISC and KPA, facilitator's guides and hiring playbooks, opening live from Google Drive.</p>

      <div className="rl-controls">
        <div className="rl-tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`rl-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="rl-search">
          <i className="ti ti-search" aria-hidden="true" />
          <input type="search" placeholder="Search resources" aria-label="Search resources" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
      </div>

      {error && <div className="rl-empty"><i className="ti ti-alert-circle" aria-hidden="true" />{error}</div>}
      {!error && items === null && <div className="rl-loading">Loading the library</div>}

      {!error && items && grouped.length === 0 && (
        <div className="rl-empty">
          <i className="ti ti-folder-open" aria-hidden="true" />
          {query ? 'Nothing matches that search. Try a different word or clear the search.'
            : tab === 'collective' ? 'No Collective resources yet. The interview guides are written for Program candidates.'
            : 'No resources yet.'}
        </div>
      )}

      {grouped.map(([category, list]) => (
        <section key={category} className="rl-section">
          <div className="rl-section-head">
            <h2>{category}</h2>
            <span>{list.length} {list.length === 1 ? 'guide' : 'guides'}</span>
          </div>

          {category === RECRUITING && tab !== 'collective' && (
            <div className="rl-path">
              <div className="rl-path-label">The Program interview path. Gold steps have their own guide.</div>
              <div className="rl-steps">
                {INTERVIEW_PATH.map(s => {
                  const has = stepsWithGuide.has(s.n)
                  return (
                    <div key={s.n} className={`rl-step${has ? ' has' : ''}`}>
                      <div className="rl-dot">{s.n}</div>
                      <div className="rl-step-name">{s.name}</div>
                      <div className="rl-step-note">{has ? 'Guide below' : s.note}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rl-grid">
            {list.map(it => {
              const isNew = it.created_at && (Date.now() - new Date(it.created_at)) < NEW_DAYS * 86400000
              const updated = formatDate(it.updated_at)
              return (
                <article key={it.id} className="rl-doc">
                  <div className="rl-doc-top">
                    <span className="rl-tag div">{DIVISION_LABEL[it.division]}</span>
                    <span className="rl-tag lock"><i className="ti ti-lock" aria-hidden="true" /> Leader only</span>
                    {isNew && <span className="rl-tag new">New</span>}
                  </div>
                  <h3>{it.title}</h3>
                  {it.step_number && category === RECRUITING && <div className="rl-stepline">Step {it.step_number} of the interview path</div>}
                  {it.description && <p>{it.description}</p>}
                  {(it.call_length || it.page_count) && (
                    <div className="rl-facts">
                      {it.call_length && <span><i className="ti ti-clock" aria-hidden="true" />{it.call_length}</span>}
                      {it.page_count && <span><i className="ti ti-file-text" aria-hidden="true" />{it.page_count} pages</span>}
                    </div>
                  )}
                  {it.sections?.length > 0 && (
                    <details className="rl-inside">
                      <summary><i className="ti ti-chevron-right" aria-hidden="true" />What's inside</summary>
                      <ul>{it.sections.map(s => <li key={s}>{s}</li>)}</ul>
                    </details>
                  )}
                  <div className="rl-foot">
                    <small>{it.available === false ? 'Not found in Drive' : updated ? `Updated ${updated}` : ''}</small>
                    <button className="rl-open" onClick={() => open(it)} disabled={it.available === false}>Open</button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}

      {reader && (
        <div className="rl-reader" role="dialog" aria-modal="true" aria-label={reader.item.title} onClick={e => { if (e.target === e.currentTarget) setReader(null) }}>
          <div className="rl-reader-box">
            <div className="rl-reader-bar">
              <strong>{reader.item.title}</strong>
              <span className="rl-src"><i className="ti ti-refresh" aria-hidden="true" />Latest version from Drive</span>
              {reader.url && (
                <a className="rl-icon" href={reader.url} target="_blank" rel="noreferrer" aria-label="Open full screen" title="Open full screen">
                  <i className="ti ti-arrows-maximize" aria-hidden="true" />
                </a>
              )}
              <button className="rl-icon" onClick={() => setReader(null)} aria-label="Close"><i className="ti ti-x" aria-hidden="true" /></button>
            </div>
            <div className="rl-viewer">
              {reader.loading && <div className="rl-loading">Opening from Drive</div>}
              {reader.error && <div className="rl-empty" style={{ margin: 24 }}><i className="ti ti-alert-circle" aria-hidden="true" />{reader.error}</div>}
              {reader.url && <iframe title={reader.item.title} src={reader.url} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const CSS = `
.rl-page { padding: 28px 32px 48px; max-width: 980px; font-family: Montserrat, Lato, sans-serif; color: #fff; }
.rl-title { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
.rl-lede { font-size: 13px; color: #aaa; margin-top: 6px; line-height: 1.6; max-width: 62ch; }
.rl-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin: 22px 0 26px; }
.rl-tabs { display: flex; gap: 6px; }
.rl-tab { padding: 7px 16px; border-radius: 20px; border: 0.5px solid #333; background: transparent; font-size: 12px; font-weight: 500; color: #888; cursor: pointer; font-family: inherit; }
.rl-tab.on { border-color: #C9A84C; color: #C9A84C; background: rgba(201,168,76,0.12); }
.rl-search { display: flex; align-items: center; gap: 8px; background: #1E1E1E; border: 0.5px solid #2a2a2a; border-radius: 8px; padding: 8px 12px; min-width: 240px; }
.rl-search i { color: #777; }
.rl-search input { background: none; border: none; color: #fff; font-family: inherit; font-size: 13px; width: 100%; outline: none; }
.rl-loading { font-size: 13px; color: #777; padding: 24px 0; }
.rl-section { margin-bottom: 30px; }
.rl-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.rl-section-head h2 { font-size: 16px; font-weight: 700; }
.rl-section-head span { font-size: 12px; color: #777; }
.rl-path { background: #1E1E1E; border: 0.5px solid #2a2a2a; border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; }
.rl-path-label { font-size: 12px; color: #aaa; margin-bottom: 14px; }
.rl-steps { display: grid; grid-template-columns: repeat(4, 1fr); position: relative; }
.rl-steps::before { content: ""; position: absolute; top: 15px; left: 12.5%; right: 12.5%; height: 1px; background: #3a3a3a; }
.rl-step { text-align: center; position: relative; padding: 0 6px; }
.rl-dot { width: 31px; height: 31px; border-radius: 50%; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; background: #0A0A0A; border: 1px solid #3a3a3a; color: #777; position: relative; }
.rl-step.has .rl-dot { background: #C9A84C; border-color: #C9A84C; color: #0A0A0A; }
.rl-step-name { font-size: 12px; font-weight: 600; }
.rl-step-note { font-size: 11px; color: #777; margin-top: 3px; line-height: 1.4; }
.rl-step.has .rl-step-note { color: #C9A84C; }
.rl-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.rl-doc { background: #1E1E1E; border: 0.5px solid #2a2a2a; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.rl-doc-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rl-tag { font-size: 10px; font-weight: 600; padding: 3px 9px; border-radius: 10px; display: inline-flex; align-items: center; gap: 4px; }
.rl-tag.div { color: #C9A84C; background: rgba(201,168,76,0.12); }
.rl-tag.lock { color: #aaa; border: 0.5px solid #3a3a3a; }
.rl-tag.new { color: #0A0A0A; background: #C9A84C; margin-left: auto; }
.rl-doc h3 { font-size: 17px; font-weight: 700; }
.rl-stepline { font-size: 12px; color: #aaa; margin-top: -6px; }
.rl-doc p { font-size: 13px; color: #aaa; line-height: 1.6; }
.rl-facts { display: flex; gap: 18px; flex-wrap: wrap; font-size: 12px; }
.rl-facts span { display: flex; align-items: center; gap: 6px; }
.rl-facts i { color: #C9A84C; font-size: 15px; }
.rl-inside { border-top: 0.5px solid #2a2a2a; padding-top: 12px; }
.rl-inside summary { font-size: 12px; font-weight: 600; cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; }
.rl-inside summary::-webkit-details-marker { display: none; }
.rl-inside summary i { transition: transform 0.15s; color: #aaa; }
.rl-inside[open] summary i { transform: rotate(90deg); }
.rl-inside ul { list-style: none; margin-top: 10px; display: flex; flex-direction: column; gap: 6px; padding: 0; }
.rl-inside li { font-size: 12px; color: #aaa; padding-left: 14px; position: relative; line-height: 1.5; }
.rl-inside li::before { content: ""; position: absolute; left: 0; top: 7px; width: 5px; height: 5px; border-radius: 50%; background: #444; }
.rl-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 4px; }
.rl-foot small { font-size: 11px; color: #777; }
.rl-open { background: #C9A84C; color: #0A0A0A; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 9px 18px; border-radius: 8px; border: none; cursor: pointer; font-family: inherit; }
.rl-open:disabled { opacity: 0.4; cursor: not-allowed; }
.rl-empty { text-align: center; padding: 40px 20px; background: #1E1E1E; border: 0.5px dashed #3a3a3a; border-radius: 12px; color: #aaa; font-size: 13px; line-height: 1.6; }
.rl-empty i { font-size: 28px; color: #3a3a3a; display: block; margin-bottom: 8px; }
.rl-reader { position: fixed; inset: 0; background: rgba(0,0,0,0.78); display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 50; }
.rl-reader-box { background: #0f0f0f; border: 0.5px solid #2a2a2a; border-radius: 14px; width: min(980px, 100%); height: min(860px, 100%); display: flex; flex-direction: column; overflow: hidden; }
.rl-reader-bar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #2a2a2a; }
.rl-reader-bar strong { font-size: 14px; flex: 1; }
.rl-src { font-size: 11px; color: #777; display: flex; align-items: center; gap: 5px; }
.rl-icon { width: 32px; height: 32px; border-radius: 8px; font-size: 17px; color: #aaa; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; }
.rl-viewer { flex: 1; background: #151515; display: flex; }
.rl-viewer iframe { flex: 1; border: none; width: 100%; height: 100%; }
.rl-viewer .rl-loading { margin: auto; }
.rl-page button:focus-visible, .rl-page a:focus-visible, .rl-page input:focus-visible { outline: 2px solid #C9A84C; outline-offset: 2px; }
@media (max-width: 820px) {
  .rl-page { padding: 22px 18px 40px; }
  .rl-grid { grid-template-columns: 1fr; }
  .rl-steps { grid-template-columns: repeat(2, 1fr); row-gap: 18px; }
  .rl-steps::before { display: none; }
  .rl-src { display: none; }
  .rl-reader { padding: 0; }
  .rl-reader-box { border-radius: 0; height: 100%; }
}
`
