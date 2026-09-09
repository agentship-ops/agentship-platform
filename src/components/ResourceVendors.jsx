import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// New categories still render fine on the fallback icon; add a line here
// only when you want a custom icon for one. No redeploy needed to add a vendor.
const CAT_ICON = {
  'Lender': 'ti-building-bank',
  'Insurance': 'ti-shield-check',
  'Home Inspector': 'ti-search',
  'Home Warranty': 'ti-file-certificate',
}
const FALLBACK_ICON = 'ti-briefcase'

export default function ResourceVendors() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState('All')

  useEffect(() => {
    let alive = true
    supabase
      .from('preferred_vendors')
      .select('*')
      .order('order_index', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return
        if (error || !data) setFailed(true)
        else setVendors(data)
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  // Chips follow the vendors' own order, first appearance wins.
  const categories = useMemo(() => {
    const seen = []
    vendors.forEach(v => { if (v.category && !seen.includes(v.category)) seen.push(v.category) })
    return ['All', ...seen]
  }, [vendors])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vendors.filter(v => {
      const okCat = activeCat === 'All' || v.category === activeCat
      const okQ = !q || [v.company, v.category, v.contact_name]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
      return okCat && okQ
    })
  }, [vendors, query, activeCat])

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.eyebrow}>Resource Library</div>
        <h1 style={styles.title}>Preferred Vendors</h1>
        <p style={styles.subtitle}>
          The people we trust. Vetted by the team. Use the pre-approval and
          scheduling links to send buyers straight to the right place.
        </p>
      </div>

      <div style={styles.searchWrap}>
        <i className="ti ti-search" aria-hidden="true" style={styles.searchIcon} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search vendors"
          style={styles.searchInput}
          aria-label="Search vendors"
        />
      </div>

      {categories.length > 1 && (
        <div style={styles.chips}>
          {categories.map(c => {
            const on = c === activeCat
            return (
              <button
                key={c}
                onClick={() => setActiveCat(c)}
                style={{ ...styles.chip, ...(on ? styles.chipActive : {}) }}
              >
                {c}
              </button>
            )
          })}
        </div>
      )}

      {loading && <p style={styles.loading}>Loading vendors…</p>}

      {failed && (
        <p style={styles.failed}>
          <i className="ti ti-alert-triangle" aria-hidden="true" style={{ fontSize: '13px' }} />
          {' '}Couldn&apos;t load the vendor list. Refresh the page, and if it keeps happening, contact Melissa Kenck.
        </p>
      )}

      {!loading && !failed && filtered.length === 0 && (
        <p style={styles.empty}>No vendors match that.</p>
      )}

      {!loading && !failed && filtered.length > 0 && (
        <div style={styles.grid}>
          {filtered.map(v => (
            <div key={v.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div style={styles.iconBox}>
                  <i className={`ti ${CAT_ICON[v.category] || FALLBACK_ICON}`} aria-hidden="true" style={{ fontSize: '18px', color: '#C9A84C' }} />
                </div>
                <div>
                  <div style={styles.company}>{v.company}</div>
                  <div style={styles.category}>{v.category}</div>
                </div>
              </div>

              <div style={styles.cardBody}>
                {v.contact_name && (
                  <div style={styles.row}>
                    <i className="ti ti-user" aria-hidden="true" style={styles.rowIcon} />
                    <span>{v.contact_name}</span>
                  </div>
                )}

                {(v.phones || []).map((p, i) => (
                  <div key={i} style={styles.row}>
                    <i className="ti ti-phone" aria-hidden="true" style={styles.rowIcon} />
                    <span>
                      {p.label && <span style={styles.phoneLabel}>{p.label}: </span>}
                      {p.number}
                    </span>
                  </div>
                ))}

                {v.email && (
                  <a href={`mailto:${v.email}`} style={{ ...styles.row, ...styles.link }}>
                    <i className="ti ti-mail" aria-hidden="true" style={styles.rowIcon} />
                    <span style={styles.ellipsis}>{v.email}</span>
                  </a>
                )}

                {v.website_url && (
                  <a href={v.website_url} target="_blank" rel="noopener noreferrer" style={{ ...styles.row, ...styles.link }}>
                    <i className="ti ti-external-link" aria-hidden="true" style={styles.rowIcon} />
                    <span style={styles.ellipsis}>{v.website_label || 'Website'}</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={styles.hint}>
        <i className="ti ti-info-circle" aria-hidden="true" style={{ fontSize: '13px' }} />
        {' '}Know a vendor the team should add? Send it to Melissa Kenck.
      </p>
    </div>
  )
}

const styles = {
  page: {
    padding: '28px 32px',
    maxWidth: '860px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    marginBottom: '4px',
  },
  eyebrow: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '1.4px',
    textTransform: 'uppercase',
    color: '#C9A84C',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: '13px',
    color: '#888',
    lineHeight: 1.7,
    maxWidth: '620px',
  },
  searchWrap: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#555',
    fontSize: '15px',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '11px 14px 11px 38px',
    background: '#141414',
    border: '0.5px solid #2a2a2a',
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: '13px',
    fontFamily: 'Montserrat, sans-serif',
    boxSizing: 'border-box',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  chip: {
    padding: '6px 13px',
    borderRadius: '20px',
    border: '0.5px solid #333',
    background: 'transparent',
    color: '#888',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'Montserrat, sans-serif',
  },
  chipActive: {
    border: '0.5px solid #C9A84C',
    color: '#C9A84C',
    background: 'rgba(201,168,76,0.08)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '12px',
  },
  card: {
    background: '#1E1E1E',
    border: '0.5px solid #2a2a2a',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  iconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '9px',
    background: 'rgba(201,168,76,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  company: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  category: {
    fontSize: '10px',
    color: '#C9A84C',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginTop: '2px',
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    borderTop: '0.5px solid #262626',
    paddingTop: '10px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: '#bbb',
  },
  rowIcon: {
    color: '#666',
    fontSize: '14px',
    flexShrink: 0,
  },
  phoneLabel: {
    color: '#777',
  },
  link: {
    color: '#C9A84C',
    textDecoration: 'none',
  },
  ellipsis: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  loading: {
    fontSize: '12px',
    color: '#777',
    margin: 0,
  },
  failed: {
    fontSize: '12px',
    color: '#e07070',
    lineHeight: 1.6,
    margin: 0,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '5px',
  },
  empty: {
    fontSize: '13px',
    color: '#555',
    padding: '20px 0',
    margin: 0,
  },
  hint: {
    fontSize: '11px',
    color: '#555',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    margin: 0,
    marginTop: '2px',
  },
}
