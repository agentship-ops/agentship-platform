import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Fill-ins are stored wrapped in {{ }}. Render them as gold pills so the
// agent's eye lands on exactly what to swap while they're on the phone.
function renderText(text) {
  if (!text) return null
  return text.split(/(\{\{.*?\}\})/g).map((part, i) => {
    const m = part.match(/^\{\{(.*)\}\}$/)
    if (m) return <span key={i} style={styles.ph}>{m[1]}</span>
    return <span key={i}>{part}</span>
  })
}

function Block({ b }) {
  switch (b.t) {
    case 'branch':
      return (
        <div style={styles.branchRow}>
          <span style={styles.branchLabel}>{b.label}</span>
          <span style={styles.branchText}>{renderText(b.c)}</span>
        </div>
      )
    case 'cue':
      return (
        <div style={styles.cue}>
          <i className="ti ti-bulb" aria-hidden="true" style={styles.cueIcon} />
          <span style={styles.cueText}>{b.c}</span>
        </div>
      )
    case 'section':
      return (
        <div style={styles.sectionDivider}>
          <span style={styles.sectionLabel}>{b.c}</span>
        </div>
      )
    case 'bullet':
      return (
        <div style={styles.bulletRow}>
          <span style={styles.bulletDot}>&bull;</span>
          <span style={styles.bulletText}>{renderText(b.c)}</span>
        </div>
      )
    case 'subquote':
      return <div style={styles.subquote}>{renderText(b.c)}</div>
    case 'line':
    default:
      return <p style={styles.line}>{renderText(b.c)}</p>
  }
}

function ReadingView({ script, onBack }) {
  const blocks = Array.isArray(script.blocks) ? script.blocks : []
  return (
    <div style={styles.reader}>
      <div style={styles.readerBar}>
        <button onClick={onBack} aria-label="Back to scripts" style={styles.backBtn}>
          <i className="ti ti-chevron-left" aria-hidden="true" style={{ fontSize: '18px' }} />
        </button>
        <div style={styles.readerTitleWrap}>
          <div style={styles.crumb}>Scripts &rsaquo; {script.category}</div>
          <div style={styles.readerTitle}>{script.title}</div>
        </div>
        {script.pdf_path && (
          <a href={script.pdf_path} download style={styles.downloadBtn}>
            <i className="ti ti-download" aria-hidden="true" style={{ fontSize: '14px' }} />
            Download
          </a>
        )}
        <span style={styles.tag}>
          <i className="ti ti-file-text" aria-hidden="true" style={{ fontSize: '12px' }} />
          Playbook
        </span>
      </div>

      <div style={styles.legend}>
        <span style={styles.legendItem}>
          <span style={styles.legendSwatch} /> your fill-ins
        </span>
        <span style={styles.legendItem}>
          <i className="ti ti-bulb" aria-hidden="true" style={{ fontSize: '12px', color: '#8a7a4a' }} /> coaching cue
        </span>
      </div>

      <div style={styles.readerBody}>
        {blocks.map((b, i) => <Block key={i} b={b} />)}
      </div>
    </div>
  )
}

export default function ScriptsLibrary() {
  const [scripts, setScripts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [openCats, setOpenCats] = useState({})
  const [openTalk, setOpenTalk] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase
        .from('scripts')
        .select('*')
        .order('category_order', { ascending: true })
        .order('order_index', { ascending: true })
      if (!active) return
      const rows = data || []
      setScripts(rows)
      // Categories open by default so nothing is hidden behind a tap.
      const cats = {}
      rows.forEach(r => { cats[r.category] = true })
      setOpenCats(cats)
      setLoading(false)
    })()
    return () => { active = false }
  }, [])

  const selected = scripts.find(s => s.id === selectedId)
  if (selected && selected.type === 'playbook') {
    return (
      <div style={styles.page}>
        <ReadingView script={selected} onBack={() => setSelectedId(null)} />
      </div>
    )
  }

  // Group into ordered categories, preserving the fetch order.
  const groups = []
  const seen = {}
  scripts.forEach(s => {
    if (!seen[s.category]) { seen[s.category] = { category: s.category, items: [] }; groups.push(seen[s.category]) }
    seen[s.category].items.push(s)
  })

  function copy(script) {
    if (navigator.clipboard) navigator.clipboard.writeText(script.body || '')
    setCopiedId(script.id)
    setTimeout(() => setCopiedId(c => (c === script.id ? null : c)), 1400)
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.eyebrow}>Resource Library</div>
        <h1 style={styles.title}>Scripts</h1>
        <p style={styles.subtitle}>
          Talk-tracks for calls, objections, and follow-up. Open a playbook to run it live,
          or copy a talk-track and go.
        </p>
      </div>

      {loading ? (
        <div style={styles.loadingRow}><span style={styles.loadingDot} /></div>
      ) : groups.length === 0 ? (
        <p style={styles.empty}>No scripts yet. They&apos;ll appear here as they&apos;re added.</p>
      ) : (
        groups.map(group => {
          const isOpen = openCats[group.category] !== false
          return (
            <div key={group.category} style={styles.catCard}>
              <button
                onClick={() => setOpenCats(p => ({ ...p, [group.category]: !isOpen }))}
                style={styles.catHeader}
              >
                <span style={styles.catName}>{group.category}</span>
                <span style={styles.catCount}>{group.items.length}</span>
                <i
                  className="ti ti-chevron-down"
                  aria-hidden="true"
                  style={{ fontSize: '14px', color: '#aaa', transition: 'transform 0.2s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                />
              </button>

              {isOpen && group.items.map(script => {
                const isPlaybook = script.type === 'playbook'
                const talkOpen = openTalk === script.id
                return (
                  <div key={script.id} style={styles.scriptRow}>
                    <div style={styles.scriptHead}>
                      <button
                        onClick={() => isPlaybook ? setSelectedId(script.id) : setOpenTalk(talkOpen ? null : script.id)}
                        style={styles.scriptTitleBtn}
                      >
                        <i
                          className={`ti ${isPlaybook ? 'ti-file-text' : 'ti-player-play'}`}
                          aria-hidden="true"
                          style={{ fontSize: '14px', color: '#777', flexShrink: 0 }}
                        />
                        <span style={styles.scriptTitle}>{script.title}</span>
                        {isPlaybook && (
                          <span style={styles.playbookHint}>
                            Playbook
                            <i className="ti ti-chevron-right" aria-hidden="true" style={{ fontSize: '13px' }} />
                          </span>
                        )}
                      </button>

                      {!isPlaybook && (
                        <button
                          onClick={() => copy(script)}
                          style={{ ...styles.copyBtn, ...(copiedId === script.id ? styles.copyBtnOn : {}) }}
                        >
                          <i className={`ti ${copiedId === script.id ? 'ti-check' : 'ti-copy'}`} aria-hidden="true" style={{ fontSize: '13px' }} />
                          {copiedId === script.id ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>

                    {!isPlaybook && talkOpen && (
                      <div style={styles.talkBody}>{renderText(script.body)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })
      )}
    </div>
  )
}

const GOLD = '#C9A84C'

const styles = {
  page: {
    padding: '28px 32px',
    maxWidth: '760px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  header: { display: 'flex', flexDirection: 'column', gap: '7px' },
  eyebrow: {
    fontSize: '11px', fontWeight: '600', letterSpacing: '1.4px',
    textTransform: 'uppercase', color: GOLD,
  },
  title: { fontSize: '24px', fontWeight: '700', color: '#FFFFFF', letterSpacing: '-0.3px' },
  subtitle: { fontSize: '13px', color: '#888', lineHeight: 1.7, maxWidth: '620px' },

  loadingRow: { display: 'flex', justifyContent: 'center', padding: '40px 0' },
  loadingDot: { width: '8px', height: '8px', borderRadius: '50%', background: GOLD },
  empty: { fontSize: '13px', color: '#666', padding: '20px 0' },

  // Category card
  catCard: {
    background: '#141414', border: '0.5px solid #2a2a2a',
    borderRadius: '10px', overflow: 'hidden',
  },
  catHeader: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
    padding: '14px 16px', background: 'transparent', border: 'none',
    cursor: 'pointer', textAlign: 'left', fontFamily: 'Montserrat, sans-serif',
  },
  catName: { flex: 1, fontSize: '15px', fontWeight: '700', color: '#fff' },
  catCount: { fontSize: '11px', color: '#555', marginRight: '4px' },

  scriptRow: { borderTop: '0.5px solid #1f1f1f' },
  scriptHead: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 16px 12px 44px',
  },
  scriptTitleBtn: {
    flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    textAlign: 'left', padding: 0, fontFamily: 'Montserrat, sans-serif',
  },
  scriptTitle: { fontSize: '13px', fontWeight: '500', color: '#fff' },
  playbookHint: {
    display: 'inline-flex', alignItems: 'center', gap: '2px',
    fontSize: '10px', color: '#666', marginLeft: '4px',
  },
  copyBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    background: 'transparent', border: '0.5px solid #333', borderRadius: '6px',
    padding: '5px 10px', cursor: 'pointer', color: '#888',
    fontSize: '11px', fontWeight: '500', fontFamily: 'Montserrat, sans-serif',
    flexShrink: 0,
  },
  copyBtnOn: { color: GOLD, borderColor: 'rgba(201,168,76,0.5)' },
  talkBody: {
    padding: '0 16px 16px 44px', fontSize: '13px', lineHeight: 1.7, color: '#ccc',
  },

  // Reading view
  reader: {
    background: '#0A0A0A', border: '0.5px solid #2a2a2a',
    borderRadius: '12px', overflow: 'hidden',
  },
  readerBar: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '14px 18px', borderBottom: '0.5px solid #222', background: '#0f0f0f',
  },
  backBtn: {
    background: 'transparent', border: 'none', color: '#888',
    cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0,
    fontFamily: 'Montserrat, sans-serif', flexShrink: 0,
  },
  readerTitleWrap: { flex: 1, minWidth: 0 },
  crumb: { fontSize: '10px', color: '#555', letterSpacing: '0.5px' },
  readerTitle: { fontSize: '15px', fontWeight: '700', color: '#fff', marginTop: '1px' },
  downloadBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    fontSize: '11px', fontWeight: '600', color: '#ccc',
    background: 'transparent', border: '0.5px solid #333', borderRadius: '8px',
    padding: '7px 12px', cursor: 'pointer', textDecoration: 'none',
    fontFamily: 'Montserrat, sans-serif', flexShrink: 0,
  },
  tag: {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    fontSize: '10px', fontWeight: '600', color: GOLD,
    background: 'rgba(201,168,76,0.1)', border: '0.5px solid rgba(201,168,76,0.35)',
    borderRadius: '20px', padding: '4px 10px', flexShrink: 0,
  },
  legend: {
    display: 'flex', alignItems: 'center', gap: '14px',
    padding: '8px 18px', borderBottom: '0.5px solid #1a1a1a', background: '#0d0d0d',
  },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#777' },
  legendSwatch: {
    display: 'inline-block', width: '22px', height: '14px', borderRadius: '3px',
    background: 'rgba(201,168,76,0.14)', border: '0.5px solid rgba(201,168,76,0.4)',
  },
  readerBody: { padding: '22px 24px 28px' },

  // Blocks
  line: { fontSize: '14px', lineHeight: 1.75, color: '#e5e5e5', margin: '0 0 14px' },
  ph: {
    display: 'inline-block', color: GOLD, background: 'rgba(201,168,76,0.13)',
    borderRadius: '4px', padding: '0 5px', fontWeight: '500',
  },
  branchRow: { display: 'flex', gap: '10px', margin: '0 0 14px', alignItems: 'flex-start' },
  branchLabel: {
    flexShrink: 0, fontSize: '10px', fontWeight: '700', color: '#0A0A0A',
    background: GOLD, borderRadius: '5px', padding: '3px 8px', marginTop: '2px', letterSpacing: '0.5px',
  },
  branchText: { fontSize: '14px', lineHeight: 1.75, color: '#e5e5e5' },
  cue: {
    display: 'flex', gap: '9px', alignItems: 'flex-start', margin: '0 0 16px',
    padding: '11px 14px', background: 'rgba(201,168,76,0.05)',
    borderLeft: '2px solid #8a7a4a', borderRadius: '0 8px 8px 0',
  },
  cueIcon: { fontSize: '15px', color: '#a58f52', flexShrink: 0, marginTop: '1px' },
  cueText: { fontSize: '12px', fontStyle: 'italic', lineHeight: 1.6, color: '#b9a877' },
  sectionDivider: {
    margin: '26px 0 14px', borderBottom: '0.5px solid #2a2a2a', paddingBottom: '8px',
  },
  sectionLabel: {
    display: 'block', fontSize: '11px', fontWeight: '700', color: GOLD,
    textTransform: 'uppercase', letterSpacing: '1.5px', lineHeight: 1.5,
  },
  bulletRow: { display: 'flex', gap: '9px', margin: '0 0 10px', alignItems: 'flex-start' },
  bulletDot: { color: GOLD, fontSize: '14px', lineHeight: 1.75, flexShrink: 0 },
  bulletText: { fontSize: '14px', lineHeight: 1.75, color: '#e5e5e5' },
  subquote: {
    margin: '0 0 12px 20px', padding: '12px 15px', background: '#141414',
    border: '0.5px solid #222', borderRadius: '8px', fontSize: '13px',
    lineHeight: 1.7, color: '#bbb', fontStyle: 'italic',
  },
}
