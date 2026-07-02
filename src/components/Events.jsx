import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

function pad(n) { return String(n).padStart(2, '0') }

function toGCalDate(d) {
  const dt = new Date(d)
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`
}

function googleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toGCalDate(event.start_time)}/${toGCalDate(event.end_time)}`,
    details: event.description || '',
    location: event.location_type === 'virtual' ? (event.meeting_link || '') : (event.location_address || ''),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function Events() {
  const { profile } = useAuth()
  const isLeader = profile?.role === 'leader'

  const [events, setEvents] = useState([])
  const [rsvps, setRsvps] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState(null)
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [detailEvent, setDetailEvent] = useState(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .order('start_time', { ascending: true })
    const { data: rsvpsData } = await supabase
      .from('event_rsvps')
      .select('*')
    setEvents(eventsData || [])
    setRsvps(rsvpsData || [])
    setLoading(false)
  }

  const eventsByDay = useMemo(() => {
    const map = {}
    events.forEach(ev => {
      const key = new Date(ev.start_time).toDateString()
      if (!map[key]) map[key] = []
      map[key].push(ev)
    })
    return map
  }, [events])

  function rsvpFor(eventId) {
    return rsvps.find(r => r.event_id === eventId && r.user_id === profile?.id)
  }

  function goingCount(eventId) {
    return rsvps.filter(r => r.event_id === eventId && r.status === 'going').length
  }

  async function setRsvp(eventId, status) {
    const existing = rsvpFor(eventId)
    if (existing) {
      const { error } = await supabase
        .from('event_rsvps')
        .update({ status })
        .eq('id', existing.id)
      if (!error) {
        setRsvps(prev => prev.map(r => r.id === existing.id ? { ...r, status } : r))
      }
    } else {
      const { data, error } = await supabase
        .from('event_rsvps')
        .insert({ event_id: eventId, user_id: profile.id, status })
        .select()
        .single()
      if (!error && data) {
        setRsvps(prev => [...prev, data])
      }
    }
  }

  async function createEvent(form) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        title: form.title,
        description: form.description,
        location_type: form.location_type,
        location_address: form.location_type === 'in_person' ? form.location_address : null,
        meeting_link: form.location_type === 'virtual' ? form.meeting_link : null,
        start_time: form.start_time,
        end_time: form.end_time,
        created_by: profile.id,
      })
      .select()
      .single()
    if (!error && data) {
      setEvents(prev => [...prev, data].sort((a, b) => new Date(a.start_time) - new Date(b.start_time)))
      setShowNewEvent(false)
    }
    return error
  }

  function canJoin(ev) {
    const start = new Date(ev.start_time)
    const end = new Date(ev.end_time)
    const joinWindowStart = new Date(start.getTime() - 10 * 60000)
    return now >= joinWindowStart && now <= end
  }

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const firstOfMonth = viewMonth
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()

  const gridDays = []
  for (let i = 0; i < startWeekday; i++) gridDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) gridDays.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d))

  const selectedDayEvents = selectedDay ? (eventsByDay[selectedDay.toDateString()] || []) : []

  if (loading) {
    return <div style={styles.page}><p style={styles.muted}>Loading events...</p></div>
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Events</h1>
          <p style={styles.subtitle}>Team events, meetups, and calls</p>
        </div>
        {isLeader && (
          <button style={styles.newBtn} onClick={() => setShowNewEvent(true)}>
            <i className="ti ti-plus" aria-hidden="true" /> New Event
          </button>
        )}
      </div>

      <div style={styles.calendarCard}>
        <div style={styles.calHeader}>
          <button style={styles.navBtn} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>
            <i className="ti ti-chevron-left" aria-hidden="true" />
          </button>
          <span style={styles.monthLabel}>{monthLabel}</span>
          <button style={styles.navBtn} onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>
            <i className="ti ti-chevron-right" aria-hidden="true" />
          </button>
        </div>

        <div style={styles.weekRow}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} style={styles.weekday}>{d}</div>
          ))}
        </div>

        <div style={styles.grid}>
          {gridDays.map((day, i) => {
            if (!day) return <div key={i} style={styles.emptyCell} />
            const key = day.toDateString()
            const dayEvents = eventsByDay[key] || []
            const isToday = sameDay(day, new Date())
            const isSelected = selectedDay && sameDay(day, selectedDay)
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(day)}
                style={{
                  ...styles.dayCell,
                  ...(isToday ? styles.dayCellToday : {}),
                  ...(isSelected ? styles.dayCellSelected : {}),
                }}
              >
                <span style={styles.dayNum}>{day.getDate()}</span>
                {dayEvents.length > 0 && (
                  <div style={styles.dotsRow}>
                    {dayEvents.slice(0, 3).map(ev => <span key={ev.id} style={styles.dot} />)}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {selectedDay && (
        <div style={styles.dayPanel}>
          <h3 style={styles.dayPanelTitle}>
            {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {selectedDayEvents.length === 0 ? (
            <p style={styles.muted}>No events this day.</p>
          ) : (
            <div style={styles.eventList}>
              {selectedDayEvents.map(ev => {
                const mine = rsvpFor(ev.id)
                return (
                  <button key={ev.id} style={styles.eventItem} onClick={() => setDetailEvent(ev)}>
                    <div style={styles.eventItemTime}>
                      {new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={styles.eventItemTitle}>{ev.title}</div>
                      <div style={styles.eventItemMeta}>
                        {ev.location_type === 'virtual' ? 'Virtual (Zoom)' : ev.location_address}
                        {' · '}{goingCount(ev.id)} going
                      </div>
                    </div>
                    {mine?.status === 'going' && <span style={styles.goingBadge}>Going</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          rsvp={rsvpFor(detailEvent.id)}
          goingCount={goingCount(detailEvent.id)}
          canJoin={canJoin(detailEvent)}
          onRsvp={status => setRsvp(detailEvent.id, status)}
          onClose={() => setDetailEvent(null)}
        />
      )}

      {showNewEvent && (
        <NewEventModal onCreate={createEvent} onClose={() => setShowNewEvent(false)} />
      )}
    </div>
  )
}

function EventDetailModal({ event, rsvp, goingCount, canJoin, onRsvp, onClose }) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <button style={styles.closeBtn} onClick={onClose}><i className="ti ti-x" aria-hidden="true" /></button>
        <h2 style={styles.modalTitle}>{event.title}</h2>
        <p style={styles.modalTime}>
          {start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {' · '}
          {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          {' – '}
          {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>

        {event.description && <p style={styles.modalDesc}>{event.description}</p>}

        <p style={styles.modalMeta}>
          <i className={`ti ${event.location_type === 'virtual' ? 'ti-video' : 'ti-map-pin'}`} aria-hidden="true" />
          {' '}
          {event.location_type === 'virtual' ? 'Virtual — Zoom' : event.location_address}
        </p>
        <p style={styles.modalMeta}>
          <i className="ti ti-users" aria-hidden="true" /> {goingCount} going
        </p>

        <div style={styles.rsvpRow}>
          <button
            style={{ ...styles.rsvpBtn, ...(rsvp?.status === 'going' ? styles.rsvpBtnActive : {}) }}
            onClick={() => onRsvp('going')}
          >
            Going
          </button>
          <button
            style={{ ...styles.rsvpBtn, ...(rsvp?.status === 'not_going' ? styles.rsvpBtnActiveDim : {}) }}
            onClick={() => onRsvp('not_going')}
          >
            Not going
          </button>
        </div>

        <div style={styles.actionRow}>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" style={styles.secondaryBtn}>
            <i className="ti ti-calendar-plus" aria-hidden="true" /> Add to Google Calendar
          </a>

          {event.location_type === 'virtual' && (
            canJoin ? (
              <a href={event.meeting_link} target="_blank" rel="noopener noreferrer" style={styles.joinBtn}>
                <i className="ti ti-video" aria-hidden="true" /> Join Zoom
              </a>
            ) : (
              <span style={styles.joinBtnDisabled}>
                <i className="ti ti-clock" aria-hidden="true" /> Join opens 10 min before start
              </span>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function NewEventModal({ onCreate, onClose }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [locationType, setLocationType] = useState('in_person')
  const [locationAddress, setLocationAddress] = useState('')
  const [meetingLink, setMeetingLink] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!title.trim() || !startTime || !endTime) {
      setError('Title, start time, and end time are required.')
      return
    }
    if (locationType === 'in_person' && !locationAddress.trim()) {
      setError('Please add a location.')
      return
    }
    if (locationType === 'virtual' && !meetingLink.trim()) {
      setError('Please add a Zoom link.')
      return
    }
    setSaving(true)
    const err = await onCreate({
      title: title.trim(),
      description: description.trim(),
      location_type: locationType,
      location_address: locationAddress.trim(),
      meeting_link: meetingLink.trim(),
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
    })
    setSaving(false)
    if (err) setError('Something went wrong creating the event.')
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <button style={styles.closeBtn} onClick={onClose}><i className="ti ti-x" aria-hidden="true" /></button>
        <h2 style={styles.modalTitle}>New Event</h2>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input style={styles.input} placeholder="Event title" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea style={{ ...styles.input, minHeight: '70px', resize: 'vertical' }} placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />

          <div style={styles.typeToggle}>
            <button type="button" style={{ ...styles.typeBtn, ...(locationType === 'in_person' ? styles.typeBtnActive : {}) }} onClick={() => setLocationType('in_person')}>In person</button>
            <button type="button" style={{ ...styles.typeBtn, ...(locationType === 'virtual' ? styles.typeBtnActive : {}) }} onClick={() => setLocationType('virtual')}>Virtual (Zoom)</button>
          </div>

          {locationType === 'in_person' ? (
            <input style={styles.input} placeholder="Address" value={locationAddress} onChange={e => setLocationAddress(e.target.value)} />
          ) : (
            <input style={styles.input} placeholder="Zoom link" value={meetingLink} onChange={e => setMeetingLink(e.target.value)} />
          )}

          <div style={styles.row}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Start</label>
              <input type="datetime-local" style={styles.input} value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>End</label>
              <input type="datetime-local" style={styles.input} value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          {error && <p style={styles.errorBox}>{error}</p>}

          <button type="submit" disabled={saving} style={styles.submitBtn}>
            {saving ? 'Creating...' : 'Create Event'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: '28px 32px', maxWidth: '860px', display: 'flex', flexDirection: 'column', gap: '20px' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#FFFFFF', letterSpacing: '-0.3px' },
  subtitle: { fontSize: '11px', color: '#555', marginTop: '3px' },
  muted: { fontSize: '13px', color: '#666' },
  newBtn: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
    background: '#C9A84C', color: '#0A0A0A', borderRadius: '8px', fontSize: '12px',
    fontWeight: '700', fontFamily: 'Montserrat, sans-serif',
  },
  calendarCard: { background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '10px', padding: '18px' },
  calHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' },
  navBtn: { width: '30px', height: '30px', borderRadius: '8px', background: 'transparent', color: '#fff', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: '14px', fontWeight: '700', color: '#fff' },
  weekRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' },
  weekday: { fontSize: '10px', color: '#555', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' },
  emptyCell: { minHeight: '52px' },
  dayCell: {
    minHeight: '52px', background: 'transparent', border: '0.5px solid #2a2a2a', borderRadius: '8px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
    padding: '6px 0', gap: '4px',
  },
  dayCellToday: { border: '0.5px solid #C9A84C' },
  dayCellSelected: { background: 'rgba(201,168,76,0.1)' },
  dayNum: { fontSize: '12px', color: '#ccc' },
  dotsRow: { display: 'flex', gap: '3px' },
  dot: { width: '5px', height: '5px', borderRadius: '50%', background: '#C9A84C' },
  dayPanel: { background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '10px', padding: '18px' },
  dayPanelTitle: { fontSize: '14px', fontWeight: '700', color: '#fff', marginBottom: '12px' },
  eventList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  eventItem: {
    display: 'flex', alignItems: 'center', gap: '12px', background: '#0A0A0A',
    border: '0.5px solid #2a2a2a', borderRadius: '8px', padding: '10px 14px', textAlign: 'left',
  },
  eventItemTime: { fontSize: '11px', color: '#C9A84C', fontWeight: '600', width: '70px', flexShrink: 0 },
  eventItemTitle: { fontSize: '13px', color: '#fff', fontWeight: '600' },
  eventItemMeta: { fontSize: '11px', color: '#666', marginTop: '2px' },
  goingBadge: { fontSize: '10px', color: '#C9A84C', background: 'rgba(201,168,76,0.12)', padding: '3px 8px', borderRadius: '10px', fontWeight: '600' },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
  },
  modal: {
    background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '14px',
    padding: '30px', width: '100%', maxWidth: '440px', position: 'relative',
  },
  closeBtn: { position: 'absolute', top: '16px', right: '16px', color: '#888', fontSize: '18px', background: 'transparent' },
  modalTitle: { fontSize: '19px', fontWeight: '700', color: '#fff', marginBottom: '6px', paddingRight: '24px' },
  modalTime: { fontSize: '12px', color: '#C9A84C', marginBottom: '14px' },
  modalDesc: { fontSize: '13px', color: '#aaa', lineHeight: 1.6, marginBottom: '14px' },
  modalMeta: { fontSize: '12px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' },
  rsvpRow: { display: 'flex', gap: '8px', margin: '16px 0' },
  rsvpBtn: {
    flex: 1, padding: '10px', borderRadius: '8px', border: '0.5px solid #333',
    background: 'transparent', color: '#ccc', fontSize: '12px', fontWeight: '600', fontFamily: 'Montserrat, sans-serif',
  },
  rsvpBtnActive: { background: 'rgba(201,168,76,0.15)', border: '0.5px solid #C9A84C', color: '#C9A84C' },
  rsvpBtnActiveDim: { background: 'rgba(224,112,112,0.1)', border: '0.5px solid #e07070', color: '#e07070' },
  actionRow: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' },
  secondaryBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px',
    borderRadius: '8px', border: '0.5px solid #333', color: '#ccc', fontSize: '12px', fontWeight: '600',
  },
  joinBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px',
    borderRadius: '8px', background: '#C9A84C', color: '#0A0A0A', fontSize: '12px', fontWeight: '700',
  },
  joinBtnDisabled: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px',
    borderRadius: '8px', background: '#2a2a2a', color: '#666', fontSize: '11px', fontWeight: '600',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  input: {
    width: '100%', padding: '11px 13px', background: '#0A0A0A', border: '0.5px solid #333',
    borderRadius: '8px', fontSize: '13px', color: '#fff', fontFamily: 'Montserrat, sans-serif', boxSizing: 'border-box',
  },
  label: { fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px', display: 'block' },
  row: { display: 'flex', gap: '10px' },
  typeToggle: { display: 'flex', gap: '8px' },
  typeBtn: {
    flex: 1, padding: '9px', borderRadius: '8px', border: '0.5px solid #333',
    background: 'transparent', color: '#aaa', fontSize: '12px', fontWeight: '600', fontFamily: 'Montserrat, sans-serif',
  },
  typeBtnActive: { border: '0.5px solid #C9A84C', color: '#C9A84C', background: 'rgba(201,168,76,0.08)' },
  errorBox: {
    fontSize: '12px', color: '#e07070', padding: '8px 12px', background: 'rgba(224,112,112,0.08)',
    borderRadius: '6px', border: '0.5px solid rgba(224,112,112,0.2)',
  },
  submitBtn: {
    width: '100%', padding: '12px', background: '#C9A84C', color: '#0A0A0A', borderRadius: '8px',
    fontSize: '12px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'Montserrat, sans-serif',
  },
}
