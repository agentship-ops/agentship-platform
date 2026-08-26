import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const GOLD = '#C9A84C'

// ---- helpers ------------------------------------------------------------

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// Local date key, e.g. "2026-9-16", used to match events to calendar cells.
function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function dateLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function timeLabel(d) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// A Date -> the value a <input type="datetime-local"> expects (local time).
function toLocalInput(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Build a Google Calendar "add event" link.
function googleCalUrl(ev) {
  const fmt = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || 'Agentship event',
    dates: `${fmt(ev.start_time)}/${fmt(ev.end_time)}`,
    details: ev.description || '',
    location: ev.location_type === 'virtual'
      ? (ev.meeting_link || 'Virtual')
      : (ev.location_address || ''),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// Build the 6-week grid of days shown for a given month.
function monthCells(year, month) {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay()) // back up to Sunday
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({ date: d, inMonth: d.getMonth() === month })
  }
  return cells
}

// ---- main ---------------------------------------------------------------

export default function Events() {
  const { user, profile } = useAuth()
  const canManage = profile?.account_type === 'admin' || profile?.account_type === 'leader'

  const [events, setEvents] = useState([])
  const [rsvps, setRsvps] = useState([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() } })
  const [selectedKey, setSelectedKey] = useState(null) // null = "Upcoming" mode
  const [now, setNow] = useState(() => new Date())
  const [editing, setEditing] = useState(null) // null | 'new' | eventObject

  // Re-tick every 30s so the "Join" button flips on without a refresh.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    const [{ data: ev }, { data: rs }] = await Promise.all([
      supabase.from('events').select('*').order('start_time', { ascending: true }),
      supabase.from('event_rsvps').select('event_id, user_id, status'),
    ])
    setEvents(ev || [])
    setRsvps(rs || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('rt-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_rsvps' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // event_id -> count of "going"
  const goingCount = useMemo(() => {
    const m = {}
    rsvps.forEach(r => { if (r.status === 'going') m[r.event_id] = (m[r.event_id] || 0) + 1 })
    return m
  }, [rsvps])

  // event_id -> my status
  const myStatus = useMemo(() => {
    const m = {}
    rsvps.forEach(r => { if (r.user_id === user?.id) m[r.event_id] = r.status })
    return m
  }, [rsvps, user])

  // days in this month that have at least one event
  const eventDays = useMemo(() => {
    const s = new Set()
    events.forEach(e => s.add(dayKey(new Date(e.start_time))))
    return s
  }, [events])

  const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor])

  // What the right-hand list shows: a selected day's events, or all upcoming.
  const listEvents = useMemo(() => {
    if (selectedKey) {
      return events.filter(e => dayKey(new Date(e.start_time)) === selectedKey)
    }
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return events.filter(e => new Date(e.end_time) >= startOfToday)
  }, [events, selectedKey, now])

  async function toggleRsvp(ev) {
    if (!user) return
    const next = myStatus[ev.id] === 'going' ? 'not_going' : 'going'
    // optimistic
    setRsvps(prev => {
      const rest = prev.filter(r => !(r.event_id === ev.id && r.user_id === user.id))
      return [...rest, { event_id: ev.id, user_id: user.id, status: next }]
    })
    const { error } = await supabase
      .from('event_rsvps')
      .upsert({ event_id: ev.id, user_id: user.id, status: next }, { onConflict: 'event_id,user_id' })
    if (error) load() // roll back to server truth on failure
  }

  async function deleteEvent(ev) {
    if (!window.confirm(`Delete "${ev.title}"? This can't be undone.`)) return
    await supabase.from('events').delete().eq('id', ev.id)
    load()
  }

  function prevMonth() {
    setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })
  }
  function nextMonth() {
    setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })
  }

  const monthTitle = new Date(cursor.year, cursor.month, 1)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const listHeading = selectedKey
    ? dateLabel(new Date(...selectedKey.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v))))
    : 'Upcoming'

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Events</h1>
          <p style={styles.subtitle}>Team calendar · RSVP to see who's coming</p>
        </div>
        {canManage && (
          <button style={styles.newBtn} onClick={() => setEditing('new')}>
            <i className="ti ti-plus" aria-hidden="true" style={{ fontSize: '15px' }} /> New event
          </button>
        )}
      </div>

      <div style={styles.grid}>
        {/* Calendar */}
        <div style={styles.calCard}>
          <div style={styles.calNav}>
            <button style={styles.calArrow} onClick={prevMonth} aria-label="Previous month">
              <i className="ti ti-chevron-left" aria-hidden="true" />
            </button>
            <div style={styles.calMonth}>{monthTitle}</div>
            <button style={styles.calArrow} onClick={nextMonth} aria-label="Next month">
              <i className="ti ti-chevron-right" aria-hidden="true" />
            </button>
          </div>

          <div style={styles.calGrid}>
            {WEEKDAYS.map(w => <div key={w} style={styles.calWeekday}>{w}</div>)}
            {cells.map(({ date, inMonth }, i) => {
              const key = dayKey(date)
              const hasEvent = eventDays.has(key)
              const isSelected = selectedKey === key
              const isToday = sameDay(date, now)
              return (
                <button
                  key={i}
                  onClick={() => setSelectedKey(isSelected ? null : key)}
                  style={{
                    ...styles.calDay,
                    color: isSelected ? '#0A0A0A' : inMonth ? (isToday ? GOLD : '#ccc') : '#3a3a3a',
                    background: isSelected ? GOLD : 'transparent',
                    fontWeight: isSelected || isToday ? 700 : 400,
                  }}
                >
                  {date.getDate()}
                  {hasEvent && !isSelected && <span style={styles.calDot} />}
                </button>
              )
            })}
          </div>

          {selectedKey && (
            <button style={styles.clearDay} onClick={() => setSelectedKey(null)}>
              <i className="ti ti-arrow-left" aria-hidden="true" style={{ fontSize: '12px' }} /> Back to upcoming
            </button>
          )}
        </div>

        {/* List */}
        <div style={styles.listCol}>
          <div style={styles.listHeading}>{listHeading}</div>

          {loading ? (
            <p style={styles.muted}>Loading events...</p>
          ) : listEvents.length === 0 ? (
            <p style={styles.muted}>
              {selectedKey ? 'Nothing scheduled this day.' : 'No upcoming events.'}
              {canManage && !selectedKey && ' Create one with New event.'}
            </p>
          ) : (
            listEvents.map(ev => (
              <EventCard
                key={ev.id}
                ev={ev}
                now={now}
                going={goingCount[ev.id] || 0}
                mine={myStatus[ev.id]}
                canManage={canManage}
                onRsvp={() => toggleRsvp(ev)}
                onEdit={() => setEditing(ev)}
                onDelete={() => deleteEvent(ev)}
              />
            ))
          )}
        </div>
      </div>

      {editing && (
        <EventForm
          event={editing === 'new' ? null : editing}
          userId={user?.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ---- event card ---------------------------------------------------------

function EventCard({ ev, now, going, mine, canManage, onRsvp, onEdit, onDelete }) {
  const start = new Date(ev.start_time)
  const end = new Date(ev.end_time)
  const isVirtual = ev.location_type === 'virtual'
  const amGoing = mine === 'going'

  // Join opens 10 minutes before start, stays open until the event ends.
  const joinOpen = isVirtual && ev.meeting_link
    && now >= new Date(start.getTime() - 10 * 60000)
    && now <= end

  return (
    <div style={{ ...styles.eventCard, borderColor: amGoing ? GOLD : '#2a2a2a' }}>
      <div style={styles.eventTop}>
        <div style={styles.eventTitle}>{ev.title}</div>
        <span style={{ ...styles.badge, ...(isVirtual ? styles.badgeVirtual : styles.badgeInPerson) }}>
          <i className={`ti ${isVirtual ? 'ti-video' : 'ti-map-pin'}`} aria-hidden="true" style={{ fontSize: '10px' }} />
          {' '}{isVirtual ? 'Virtual' : 'In person'}
        </span>
      </div>

      <div style={styles.eventMeta}>
        <i className="ti ti-clock" aria-hidden="true" style={{ fontSize: '12px' }} />
        {' '}{dateLabel(start)} · {timeLabel(start)}
      </div>

      {ev.description && <p style={styles.eventDesc}>{ev.description}</p>}

      {!isVirtual && ev.location_address && (
        <div style={styles.eventMeta}>
          <i className="ti ti-map-pin" aria-hidden="true" style={{ fontSize: '12px' }} />
          {' '}{ev.location_address}
        </div>
      )}

      <div style={styles.eventFoot}>
        <span style={{ ...styles.goingCount, color: going > 0 ? '#6ec46e' : '#888' }}>
          <i className="ti ti-users" aria-hidden="true" style={{ fontSize: '11px' }} /> {going} going
        </span>

        <div style={styles.footActions}>
          {isVirtual && ev.meeting_link && (
            joinOpen ? (
              <a href={ev.meeting_link} target="_blank" rel="noreferrer" style={styles.joinBtn}>
                <i className="ti ti-video" aria-hidden="true" style={{ fontSize: '11px' }} /> Join
              </a>
            ) : (
              <span style={styles.joinSoon}>Join opens soon</span>
            )
          )}
          <a href={googleCalUrl(ev)} target="_blank" rel="noreferrer" style={styles.calLink} aria-label="Add to Google Calendar">
            <i className="ti ti-calendar-plus" aria-hidden="true" style={{ fontSize: '13px' }} />
          </a>
          <button
            onClick={onRsvp}
            style={amGoing ? styles.rsvpGoing : styles.rsvpBtn}
          >
            {amGoing
              ? <><i className="ti ti-check" aria-hidden="true" style={{ fontSize: '11px' }} /> Going</>
              : 'RSVP'}
          </button>
          {canManage && (
            <>
              <button onClick={onEdit} style={styles.iconBtn} aria-label="Edit event">
                <i className="ti ti-pencil" aria-hidden="true" />
              </button>
              <button onClick={onDelete} style={styles.iconBtn} aria-label="Delete event">
                <i className="ti ti-trash" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- create / edit modal ------------------------------------------------

function EventForm({ event, userId, onClose, onSaved }) {
  const isEdit = !!event
  const [title, setTitle] = useState(event?.title || '')
  const [description, setDescription] = useState(event?.description || '')
  const [locationType, setLocationType] = useState(event?.location_type || 'in_person')
  const [address, setAddress] = useState(event?.location_address || '')
  const [meetingLink, setMeetingLink] = useState(event?.meeting_link || '')
  const [start, setStart] = useState(event ? toLocalInput(new Date(event.start_time)) : '')
  const [end, setEnd] = useState(event ? toLocalInput(new Date(event.end_time)) : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setError('')
    if (!title.trim()) return setError('Give the event a title.')
    if (!start) return setError('Pick a start time.')
    if (!end) return setError('Pick an end time.')
    if (new Date(end) <= new Date(start)) return setError('The end time has to be after the start time.')

    setSaving(true)
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      location_type: locationType,
      location_address: locationType === 'in_person' ? (address.trim() || null) : null,
      meeting_link: locationType === 'virtual' ? (meetingLink.trim() || null) : null,
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
    }

    let dbError
    if (isEdit) {
      ({ error: dbError } = await supabase.from('events').update(payload).eq('id', event.id))
    } else {
      ({ error: dbError } = await supabase.from('events').insert({ ...payload, created_by: userId }))
    }

    setSaving(false)
    if (dbError) { setError(dbError.message); return }
    onSaved()
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={styles.modalTitle}>{isEdit ? 'Edit event' : 'New event'}</div>
          <button onClick={onClose} style={styles.iconBtn} aria-label="Close">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Title</label>
          <input style={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Tuesday team huddle" />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Description</label>
          <textarea style={{ ...styles.input, minHeight: '70px', resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details for the team" />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Type</label>
          <div style={styles.toggleRow}>
            <button
              style={{ ...styles.toggle, ...(locationType === 'in_person' ? styles.toggleOn : {}) }}
              onClick={() => setLocationType('in_person')}
            >
              <i className="ti ti-map-pin" aria-hidden="true" /> In person
            </button>
            <button
              style={{ ...styles.toggle, ...(locationType === 'virtual' ? styles.toggleOn : {}) }}
              onClick={() => setLocationType('virtual')}
            >
              <i className="ti ti-video" aria-hidden="true" /> Virtual
            </button>
          </div>
        </div>

        {locationType === 'in_person' ? (
          <div style={styles.field}>
            <label style={styles.label}>Address</label>
            <input style={styles.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, Acworth GA" />
          </div>
        ) : (
          <div style={styles.field}>
            <label style={styles.label}>Meeting link</label>
            <input style={styles.input} value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://zoom.us/j/..." />
          </div>
        )}

        <div style={styles.twoCol}>
          <div style={styles.field}>
            <label style={styles.label}>Starts</label>
            <input type="datetime-local" style={styles.input} value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Ends</label>
            <input type="datetime-local" style={styles.input} value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>

        {error && <p style={styles.errorBox}>{error}</p>}

        <div style={styles.modalFoot}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- styles -------------------------------------------------------------

const styles = {
  page: { padding: '28px 32px', maxWidth: '900px', display: 'flex', flexDirection: 'column', gap: '18px' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#FFFFFF', letterSpacing: '-0.3px' },
  subtitle: { fontSize: '11px', color: '#555', marginTop: '3px' },
  newBtn: {
    display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 14px', borderRadius: '8px',
    background: GOLD, color: '#0A0A0A', fontSize: '12px', fontWeight: '700', border: 'none',
    cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: '14px', alignItems: 'start' },

  calCard: { background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '12px', padding: '14px' },
  calNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  calArrow: {
    width: '28px', height: '28px', borderRadius: '7px', background: '#0A0A0A', border: '0.5px solid #333',
    color: '#aaa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Montserrat, sans-serif',
  },
  calMonth: { fontSize: '14px', fontWeight: '700', color: '#fff' },
  calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' },
  calWeekday: { textAlign: 'center', fontSize: '9px', color: '#555', letterSpacing: '0.6px', paddingBottom: '4px' },
  calDay: {
    aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px',
    borderRadius: '7px', border: 'none', background: 'transparent', cursor: 'pointer', position: 'relative',
    fontFamily: 'Montserrat, sans-serif',
  },
  calDot: { position: 'absolute', bottom: '5px', width: '4px', height: '4px', borderRadius: '50%', background: GOLD },
  clearDay: {
    marginTop: '12px', display: 'flex', alignItems: 'center', gap: '5px', background: 'transparent',
    border: 'none', color: '#888', fontSize: '11px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
  },

  listCol: { display: 'flex', flexDirection: 'column', gap: '10px' },
  listHeading: { fontSize: '10px', color: '#666', letterSpacing: '0.8px', textTransform: 'uppercase' },
  muted: { fontSize: '12px', color: '#666', lineHeight: 1.6 },

  eventCard: { background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '12px', padding: '12px' },
  eventTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' },
  eventTitle: { fontSize: '13px', fontWeight: '700', color: '#fff', lineHeight: 1.3 },
  badge: { fontSize: '9px', fontWeight: '700', padding: '2px 7px', borderRadius: '8px', whiteSpace: 'nowrap' },
  badgeVirtual: { color: GOLD, background: 'rgba(201,168,76,0.12)' },
  badgeInPerson: { color: '#aaa', background: '#2a2a2a' },
  eventMeta: { fontSize: '11px', color: '#888', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' },
  eventDesc: { fontSize: '11px', color: '#aaa', marginTop: '6px', lineHeight: 1.5 },
  eventFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '10px', borderTop: '0.5px solid #2a2a2a', gap: '8px' },
  goingCount: { fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' },
  footActions: { display: 'flex', alignItems: 'center', gap: '6px' },
  joinBtn: {
    fontSize: '10px', fontWeight: '700', color: '#0A0A0A', background: GOLD, padding: '5px 10px',
    borderRadius: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px',
  },
  joinSoon: { fontSize: '9px', color: '#666' },
  calLink: { color: '#888', display: 'inline-flex', alignItems: 'center' },
  rsvpBtn: {
    fontSize: '10px', fontWeight: '700', color: '#aaa', background: 'transparent', border: '0.5px solid #333',
    padding: '5px 12px', borderRadius: '14px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
  },
  rsvpGoing: {
    fontSize: '10px', fontWeight: '700', color: '#0A0A0A', background: GOLD, border: 'none',
    padding: '5px 12px', borderRadius: '14px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
    display: 'inline-flex', alignItems: 'center', gap: '4px',
  },
  iconBtn: {
    width: '26px', height: '26px', borderRadius: '7px', background: 'transparent', border: 'none',
    color: '#777', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '15px', fontFamily: 'Montserrat, sans-serif',
  },

  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 50,
  },
  modal: {
    width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto', background: '#1E1E1E',
    border: '0.5px solid #2a2a2a', borderRadius: '16px', padding: '20px 22px',
    display: 'flex', flexDirection: 'column', gap: '14px',
  },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: '16px', fontWeight: '700', color: '#fff' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '11px', fontWeight: '500', color: '#888', letterSpacing: '0.8px', textTransform: 'uppercase' },
  input: {
    width: '100%', padding: '10px 12px', background: '#0A0A0A', border: '0.5px solid #333', borderRadius: '8px',
    fontSize: '13px', color: '#fff', fontFamily: 'Montserrat, sans-serif', boxSizing: 'border-box',
  },
  toggleRow: { display: 'flex', gap: '8px' },
  toggle: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px',
    borderRadius: '8px', background: '#0A0A0A', border: '0.5px solid #333', color: '#888', fontSize: '12px',
    fontWeight: '600', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
  },
  toggleOn: { border: `0.5px solid ${GOLD}`, color: GOLD, background: 'rgba(201,168,76,0.08)' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  errorBox: {
    fontSize: '12px', color: '#e07070', padding: '8px 12px', background: 'rgba(224,112,112,0.08)',
    borderRadius: '6px', border: '0.5px solid rgba(224,112,112,0.2)', lineHeight: 1.5,
  },
  modalFoot: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' },
  cancelBtn: {
    padding: '9px 16px', borderRadius: '8px', background: 'transparent', border: '0.5px solid #333',
    color: '#aaa', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
  },
  saveBtn: {
    padding: '9px 16px', borderRadius: '8px', background: GOLD, border: 'none', color: '#0A0A0A',
    fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
  },
}
