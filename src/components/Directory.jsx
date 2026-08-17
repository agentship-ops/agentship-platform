import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export default function Directory() {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, title, phone, email, city, state, avatar_url')
        .order('first_name', { ascending: true })
        .order('last_name', { ascending: true })
      if (alive) {
        setPeople(data || [])
        setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter(p => {
      const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase()
      const title = (p.title ?? '').toLowerCase()
      return name.includes(q) || title.includes(q)
    })
  }, [people, query])

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Directory</h1>
        <p style={styles.subtitle}>Everyone at Agentship</p>
      </div>

      <div style={styles.searchWrap}>
        <i className="ti ti-search" aria-hidden="true" style={styles.searchIcon} />
        <input
          style={styles.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or title"
          aria-label="Search the directory"
        />
      </div>

      {loading ? (
        <p style={styles.muted}>Loading the team...</p>
      ) : filtered.length === 0 ? (
        <p style={styles.muted}>No one matches that search.</p>
      ) : (
        <div style={styles.grid}>
          {filtered.map(p => <Card key={p.id} person={p} />)}
        </div>
      )}
    </div>
  )
}

function Card({ person }) {
  const first = person.first_name ?? ''
  const last = person.last_name ?? ''
  const initials = `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?'
  const location = [person.city, person.state].filter(Boolean).join(', ')

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        {person.avatar_url ? (
          <img src={person.avatar_url} alt={`${first} ${last}`} style={styles.avatarImg} />
        ) : (
          <div style={styles.avatarInitials}>{initials}</div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={styles.name}>{first} {last}</div>
          {person.title && <div style={styles.role}>{person.title}</div>}
        </div>
      </div>

      <div style={styles.details}>
        {person.phone && (
          <a href={`tel:${person.phone.replace(/[^0-9+]/g, '')}`} style={styles.row}>
            <i className="ti ti-phone" aria-hidden="true" style={styles.rowIcon} />
            <span style={styles.rowText}>{person.phone}</span>
          </a>
        )}
        {person.email && (
          <a href={`mailto:${person.email}`} style={styles.row}>
            <i className="ti ti-mail" aria-hidden="true" style={styles.rowIcon} />
            <span style={styles.rowText}>{person.email}</span>
          </a>
        )}
        {location && (
          <div style={styles.row}>
            <i className="ti ti-map-pin" aria-hidden="true" style={styles.rowIcon} />
            <span style={styles.rowText}>{location}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    padding: '28px 32px',
    maxWidth: '900px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  header: {},
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: '11px',
    color: '#555',
    marginTop: '3px',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: '#1E1E1E',
    border: '0.5px solid #2a2a2a',
    borderRadius: '8px',
    padding: '10px 13px',
  },
  searchIcon: {
    fontSize: '15px',
    color: '#666',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#FFFFFF',
    fontSize: '13px',
    fontFamily: 'Montserrat, sans-serif',
  },
  muted: {
    fontSize: '13px',
    color: '#555',
    padding: '8px 2px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '14px',
  },
  card: {
    background: '#1E1E1E',
    border: '0.5px solid #2a2a2a',
    borderRadius: '12px',
    padding: '16px',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '13px',
  },
  avatarImg: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },
  avatarInitials: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    background: '#2a2a2a',
    color: '#C9A84C',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
    fontWeight: '700',
    flexShrink: 0,
  },
  name: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#FFFFFF',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  role: {
    fontSize: '11px',
    color: '#C9A84C',
    marginTop: '1px',
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderTop: '0.5px solid #2a2a2a',
    paddingTop: '12px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    color: '#aaaaaa',
    textDecoration: 'none',
  },
  rowIcon: {
    fontSize: '15px',
    color: '#666',
    flexShrink: 0,
  },
  rowText: {
    fontSize: '12px',
    color: '#aaaaaa',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
}
