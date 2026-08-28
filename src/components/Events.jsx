import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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

// Compact time for calendar chips, e.g. "9a", "2:30p".
function shortTime(d) {
  let h = d.getHours()
  const m = d.getMinutes()
  const ap = h < 12 ? 'a' : 'p'
  h = h % 12
  if (h === 0) h = 12
  return m === 0 ? `${h}${ap}` : `${h}:${String(m).padStart(2, '0')}${ap}`
}

// Build a Google Calendar "add event" link. All-day events use the
// date-only format, where Google treats the end date as exclusive.
function googleCalUrl(ev) {
  const pad = n => String(n).padStart(2, '0')
  let dates
  if (ev.all_day) {
    const s = new Date(ev.start_time)
    const e = new Date(ev.end_time)
    const day = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    const endExclusive = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1)
    dates = `${day(s)}/${day(endExclusive)}`
  } else {
    const fmt = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    dates = `${fmt(ev.start_time)}/${fmt(ev.end_time)}`
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || 'Agentship event',
    dates,
    details: ev.description || '',
    location: ev.location_type === 'virtual'
      ? (ev.meeting_link || 'Virtual')
      : (ev.location_address || ''),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// Time choices for the picker, every 15 minutes, labelled in local format.
const TIME_OPTIONS = (() => {
  const arr = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const d = new Date(2000, 0, 1, h, m)
      arr.push({ value: h * 60 + m, label: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) })
    }
  }
  return arr
})()

// Step a date forward by one repeat interval, i times.
function addInterval(date, freq, i) {
  const d = new Date(date)
  if (freq === 'daily') d.setDate(d.getDate() + i)
  else if (freq === 'weekly') d.setDate(d.getDate() + 7 * i)
  else if (freq === 'biweekly') d.setDate(d.getDate() + 14 * i)
  else if (freq === 'monthly') d.setMonth(d.getMonth() + i)
  return d
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
  const [view, setView] = useState('month')             // 'month' | 'week' | 'day'
  const [anchor, setAnchor] = useState(() => new Date()) // focused date for the current view
  const [now, setNow] = useState(() => new Date())
  const [editing, setEditing] = useState(null)          // null | 'new' | eventObject
  const [detail, setDetail] = useState(null)             // event shown in the detail popup

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

  const goingCount = useMemo(() => {
    const m = {}
    rsvps.forEach(r => { if (r.status === 'going') m[r.event_id] = (m[r.event_id] || 0) + 1 })
    return m
  }, [rsvps])

  const myStatus = useMemo(() => {
    const m = {}
    rsvps.forEach(r => { if (r.user_id === user?.id) m[r.event_id] = r.status })
    return m
  }, [rsvps, user])

  // dayKey -> that day's events, sorted by start time
  const eventsByDay = useMemo(() => {
    const m = {}
    events.forEach(e => {
      const k = dayKey(new Date(e.start_time))
      ;(m[k] = m[k] || []).push(e)
    })
    Object.values(m).forEach(list => list.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)))
    return m
  }, [events])

  const cells = useMemo(() => monthCells(anchor.getFullYear(), anchor.getMonth()), [anchor])

  const weekDays = useMemo(() => {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay())
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [anchor])

  async function toggleRsvp(ev) {
    if (!user) return
    const next = myStatus[ev.id] === 'going' ? 'not_going' : 'going'
    setRsvps(prev => {
      const rest = prev.filter(r => !(r.event_id === ev.id && r.user_id === user.id))
      return [...rest, { event_id: ev.id, user_id: user.id, status: next }]
    })
    const { error } = await supabase
      .from('event_rsvps')
      .upsert({ event_id: ev.id, user_id: user.id, status: next }, { onConflict: 'event_id,user_id' })
    if (error) load()
  }

  async function deleteEvent(ev) {
    if (!window.confirm(`Delete "${ev.title}"?`)) return
    if (ev.series_id) {
      const whole = window.confirm('This event repeats.\n\nOK = delete the whole series.\nCancel = delete only this one.')
      if (whole) await supabase.from('events').delete().eq('series_id', ev.series_id)
      else await supabase.from('events').delete().eq('id', ev.id)
    } else {
      await supabase.from('events').delete().eq('id', ev.id)
    }
    load()
  }

  function shift(dir) {
    setAnchor(a => {
      if (view === 'month') return new Date(a.getFullYear(), a.getMonth() + dir, 1)
      const days = view === 'week' ? 7 * dir : dir
      return new Date(a.getFullYear(), a.getMonth(), a.getDate() + days)
    })
  }
  function goToday() { setAnchor(new Date()) }
  function openDay(d) { setAnchor(new Date(d.getFullYear(), d.getMonth(), d.getDate())); setView('day') }

  const title = view === 'month'
    ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : view === 'day'
    ? anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  const dayEvents = eventsByDay[dayKey(anchor)] || []

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

      <div style={styles.controls}>
        <div style={styles.controlsLeft}>
          <button style={styles.calArrow} onClick={() => shift(-1)} aria-label="Previous"><i className="ti ti-chevron-left" aria-hidden="true" /></button>
          <button style={styles.calArrow} onClick={() => shift(1)} aria-label="Next"><i className="ti ti-chevron-right" aria-hidden="true" /></button>
          <button style={styles.todayBtn} onClick={goToday}>Today</button>
          <div style={styles.calMonth}>{title}</div>
        </div>
        <div style={styles.segmented}>
          {['day', 'week', 'month'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ ...styles.segBtn, ...(view === v ? styles.segBtnOn : {}) }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={styles.muted}>Loading events...</p>
      ) : view === 'month' ? (
        <div style={styles.monthCard}>
          <div style={styles.monthGrid}>
            {WEEKDAYS.map(w => <div key={w} style={styles.calWeekday}>{w}</div>)}
            {cells.map(({ date, inMonth }, i) => {
              const list = eventsByDay[dayKey(date)] || []
              const isToday = sameDay(date, now)
              return (
                <div key={i} style={{ ...styles.monthCell, background: inMonth ? '#1b1b1b' : 'transparent' }}>
                  <button
                    onClick={() => openDay(date)}
                    style={{
                      ...styles.monthNum,
                      color: isToday ? '#0A0A0A' : inMonth ? '#ccc' : '#3a3a3a',
                      background: isToday ? GOLD : 'transparent',
                      fontWeight: isToday ? 700 : 400,
                    }}
                  >
                    {date.getDate()}
                  </button>
                  {list.slice(0, 2).map(ev => (
                    <button key={ev.id} onClick={() => openDay(date)} style={styles.monthChip}>
                      {ev.all_day ? 'All day' : shortTime(new Date(ev.start_time))} · {ev.title}
                    </button>
                  ))}
                  {list.length > 2 && (
                    <button onClick={() => openDay(date)} style={styles.monthMore}>+{list.length - 2} more</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : view === 'week' ? (
        <TimeGrid key="week" days={weekDays} eventsByDay={eventsByDay} now={now} onOpenDay={openDay} onOpenEvent={setDetail} />
      ) : (
        <TimeGrid key="day" days={[new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())]} eventsByDay={eventsByDay} now={now} onOpenDay={openDay} onOpenEvent={setDetail} />
      )}

      {editing && (
        <EventForm
          event={editing === 'new' ? null : editing}
          userId={user?.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      {detail && (
        <div style={styles.overlay} onClick={() => setDetail(null)}>
          <div style={{ width: '100%', maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <EventCard
              ev={detail}
              now={now}
              going={goingCount[detail.id] || 0}
              mine={myStatus[detail.id]}
              canManage={canManage}
              onRsvp={() => toggleRsvp(detail)}
              onEdit={() => { setDetail(null); setEditing(detail) }}
              onDelete={async () => { await deleteEvent(detail); setDetail(null) }}
            />
          </div>
        </div>
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
        <div style={styles.badgeGroup}>
          {ev.series_id && (
            <span style={styles.repeatChip}>
              <i className="ti ti-repeat" aria-hidden="true" style={{ fontSize: '10px' }} /> Repeats
            </span>
          )}
          <span style={{ ...styles.badge, ...(isVirtual ? styles.badgeVirtual : styles.badgeInPerson) }}>
            <i className={`ti ${isVirtual ? 'ti-video' : 'ti-map-pin'}`} aria-hidden="true" style={{ fontSize: '10px' }} />
            {' '}{isVirtual ? 'Virtual' : 'In person'}
          </span>
        </div>
      </div>

      <div style={styles.eventMeta}>
        <i className="ti ti-clock" aria-hidden="true" style={{ fontSize: '12px' }} />
        {' '}{dateLabel(start)}{ev.all_day ? ' · All day' : ` · ${timeLabel(start)}`}
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

// ---- date + time picker (branded popup) ---------------------------------

function DateTimeField({ value, onChange, allDay }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const base = value || new Date()
    return { year: base.getFullYear(), month: base.getMonth() }
  })
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const cells = monthCells(view.year, view.month)
  const monthTitle = new Date(view.year, view.month, 1)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const minutes = value ? value.getHours() * 60 + value.getMinutes() : 9 * 60

  function pickDay(d) {
    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0))
  }
  function pickTime(mins) {
    const b = value || new Date()
    onChange(new Date(b.getFullYear(), b.getMonth(), b.getDate(), Math.floor(mins / 60), mins % 60, 0, 0))
  }

  const display = value
    ? (allDay
        ? value.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        : `${value.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`)
    : 'Pick a date'

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button type="button" style={styles.pickerBtn} onClick={() => setOpen(o => !o)}>
        <i className="ti ti-calendar" aria-hidden="true" style={{ fontSize: '14px', color: GOLD }} />
        <span>{display}</span>
      </button>

      {open && (
        <div style={styles.pickerPop}>
          <div style={styles.calNav}>
            <button type="button" style={styles.calArrow} aria-label="Previous month"
              onClick={() => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 })}>
              <i className="ti ti-chevron-left" aria-hidden="true" />
            </button>
            <div style={styles.calMonth}>{monthTitle}</div>
            <button type="button" style={styles.calArrow} aria-label="Next month"
              onClick={() => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 })}>
              <i className="ti ti-chevron-right" aria-hidden="true" />
            </button>
          </div>

          <div style={styles.calGrid}>
            {WEEKDAYS.map(w => <div key={w} style={styles.calWeekday}>{w}</div>)}
            {cells.map(({ date, inMonth }, i) => {
              const selected = value && sameDay(date, value)
              return (
                <button type="button" key={i} onClick={() => pickDay(date)}
                  style={{
                    ...styles.calDay,
                    fontSize: '13px',
                    color: selected ? '#0A0A0A' : inMonth ? '#ccc' : '#3a3a3a',
                    background: selected ? GOLD : 'transparent',
                    fontWeight: selected ? 700 : 400,
                  }}>
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          {!allDay && (
            <select style={styles.timeSelect} value={minutes} onChange={e => pickTime(Number(e.target.value))}>
              {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}

          <button type="button" style={styles.pickerDone} onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
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
  const [start, setStart] = useState(event ? new Date(event.start_time) : null)
  const [end, setEnd] = useState(event ? new Date(event.end_time) : null)
  const [allDay, setAllDay] = useState(event?.all_day || false)
  const [repeatFreq, setRepeatFreq] = useState('none')
  const [endMode, setEndMode] = useState('count')
  const [count, setCount] = useState(8)
  const [until, setUntil] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setError('')
    if (!title.trim()) return setError('Give the event a title.')
    if (!start) return setError('Pick a start date.')
    if (!end) return setError('Pick an end date.')

    // For all-day, ignore the clock and span midnight to end-of-day.
    let s = new Date(start)
    let e = new Date(end)
    if (allDay) {
      s = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0)
      e = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 0, 0)
    }
    if (e <= s) return setError('The end has to be after the start.')

    setSaving(true)
    const base = {
      title: title.trim(),
      description: description.trim() || null,
      location_type: locationType,
      location_address: locationType === 'in_person' ? (address.trim() || null) : null,
      meeting_link: locationType === 'virtual' ? (meetingLink.trim() || null) : null,
      all_day: allDay,
    }

    let dbError
    if (isEdit) {
      ({ error: dbError } = await supabase.from('events')
        .update({ ...base, start_time: s.toISOString(), end_time: e.toISOString() })
        .eq('id', event.id))
    } else if (repeatFreq === 'none') {
      ({ error: dbError } = await supabase.from('events')
        .insert({ ...base, start_time: s.toISOString(), end_time: e.toISOString(), created_by: userId }))
    } else {
      // Generate the concrete occurrences up front, all sharing one series id.
      const duration = e.getTime() - s.getTime()
      const starts = []
      if (endMode === 'count') {
        const n = Math.min(Math.max(parseInt(count, 10) || 2, 2), 52)
        for (let i = 0; i < n; i++) starts.push(addInterval(s, repeatFreq, i))
      } else {
        if (!until) { setSaving(false); return setError('Pick a date for the series to end.') }
        const untilDate = new Date(`${until}T23:59:59`)
        for (let i = 0; i < 60; i++) {
          const so = addInterval(s, repeatFreq, i)
          if (so > untilDate) break
          starts.push(so)
        }
        if (starts.length === 0) { setSaving(false); return setError('That end date is before the first event.') }
      }
      const seriesId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const rows = starts.map(so => ({
        ...base,
        series_id: seriesId,
        start_time: so.toISOString(),
        end_time: new Date(so.getTime() + duration).toISOString(),
        created_by: userId,
      }))
      ;({ error: dbError } = await supabase.from('events').insert(rows))
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

        <div style={styles.allDayRow}>
          <label style={styles.label}>All day</label>
          <button type="button" role="switch" aria-checked={allDay} aria-label="All day"
            onClick={() => setAllDay(a => !a)}
            style={{ ...styles.switch, ...(allDay ? styles.switchOn : {}) }}>
            <span style={{ ...styles.switchKnob, ...(allDay ? styles.switchKnobOn : {}) }} />
          </button>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Starts</label>
          <DateTimeField value={start} onChange={setStart} allDay={allDay} />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Ends</label>
          <DateTimeField value={end} onChange={setEnd} allDay={allDay} />
        </div>

        {!isEdit && (
          <div style={styles.field}>
            <label style={styles.label}>Repeat</label>
            <select style={styles.input} value={repeatFreq} onChange={e => setRepeatFreq(e.target.value)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
            {repeatFreq !== 'none' && (
              <div style={styles.repeatEndRow}>
                <select style={{ ...styles.input, width: 'auto', flex: '0 0 auto' }} value={endMode} onChange={e => setEndMode(e.target.value)}>
                  <option value="count">Ends after</option>
                  <option value="until">Ends on</option>
                </select>
                {endMode === 'count' ? (
                  <span style={styles.repeatInline}>
                    <input type="number" min="2" max="52" style={{ ...styles.input, width: '70px' }} value={count} onChange={e => setCount(e.target.value)} /> times
                  </span>
                ) : (
                  <input type="date" style={styles.input} value={until} onChange={e => setUntil(e.target.value)} />
                )}
              </div>
            )}
          </div>
        )}

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

// ---- day / week time grid ----------------------------------------------

const HOUR_PX = 48
const START_HOUR = 6
const END_HOUR = 22
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)
const GRID_MIN = START_HOUR * 60
const GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_PX

function fmtHour(h) {
  if (h === 0) return '12a'
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

function minsOfDay(d) { return d.getHours() * 60 + d.getMinutes() }

// Position a day's timed events, splitting overlaps into side-by-side columns.
function layoutDay(list) {
  const items = list.map(ev => {
    const s = new Date(ev.start_time)
    const e = new Date(ev.end_time)
    const startMin = minsOfDay(s)
    let endMin = sameDay(s, e) ? minsOfDay(e) : 1440
    if (endMin <= startMin) endMin = Math.min(1440, startMin + 30)
    return { ev, startMin, endMin }
  })
  items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const result = {}
  let cluster = []
  let clusterEnd = -1
  function flush() {
    const colEnds = []
    cluster.forEach(it => {
      let placed = -1
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= it.startMin) { colEnds[c] = it.endMin; placed = c; break }
      }
      if (placed < 0) { colEnds.push(it.endMin); placed = colEnds.length - 1 }
      it.col = placed
    })
    const cols = colEnds.length
    cluster.forEach(it => {
      const topPx = Math.max(0, Math.min(GRID_HEIGHT, ((it.startMin - GRID_MIN) / 60) * HOUR_PX))
      const botPx = Math.max(0, Math.min(GRID_HEIGHT, ((it.endMin - GRID_MIN) / 60) * HOUR_PX))
      result[it.ev.id] = {
        col: it.col,
        cols,
        top: topPx,
        height: Math.max(20, botPx - topPx),
      }
    })
  }
  items.forEach(it => {
    if (cluster.length && it.startMin >= clusterEnd) { flush(); cluster = []; clusterEnd = -1 }
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.endMin)
  })
  if (cluster.length) flush()
  return result
}

function TimeGrid({ days, eventsByDay, now, onOpenDay, onOpenEvent }) {
  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [])
  const showHeaders = days.length > 1
  const hasAllDay = days.some(d => (eventsByDay[dayKey(d)] || []).some(e => e.all_day))

  return (
    <div style={styles.tgCard}>
      {showHeaders && (
        <div style={styles.tgHeaderRow}>
          <div style={styles.tgGutterHead} />
          {days.map((d, i) => {
            const isToday = sameDay(d, now)
            return (
              <button key={i} style={styles.tgHeadCell} onClick={() => onOpenDay(d)}>
                <div style={styles.weekDow}>{WEEKDAYS[d.getDay()]}</div>
                <div style={{ ...styles.weekDate, color: isToday ? GOLD : '#ccc', fontWeight: isToday ? 700 : 500 }}>{d.getDate()}</div>
              </button>
            )
          })}
        </div>
      )}

      {hasAllDay && (
        <div style={styles.tgAllDayRow}>
          <div style={styles.tgAllDayLabel}>all-day</div>
          {days.map((d, i) => {
            const ad = (eventsByDay[dayKey(d)] || []).filter(e => e.all_day)
            return (
              <div key={i} style={styles.tgAllDayCol}>
                {ad.map(ev => (
                  <button key={ev.id} style={styles.tgAllDayChip} onClick={() => onOpenEvent(ev)}>{ev.title}</button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      <div ref={scrollRef} style={styles.tgScroll}>
        <div style={{ display: 'flex', height: GRID_HEIGHT, position: 'relative' }}>
          <div style={styles.tgGutter}>
            {HOURS.map(h => <div key={h} style={{ ...styles.tgHourLabel, top: (h - START_HOUR) * HOUR_PX }}>{fmtHour(h)}</div>)}
          </div>
          {days.map((d, di) => {
            const timed = (eventsByDay[dayKey(d)] || []).filter(e => !e.all_day)
            const pos = layoutDay(timed)
            return (
              <div key={di} style={styles.tgCol}>
                {HOURS.map(h => <div key={h} style={{ ...styles.tgHourLine, top: (h - START_HOUR) * HOUR_PX }} />)}
                {timed.map(ev => {
                  const p = pos[ev.id]
                  if (!p) return null
                  const width = `calc(${100 / p.cols}% - 3px)`
                  const left = `calc(${(100 / p.cols) * p.col}% + 1px)`
                  return (
                    <button key={ev.id} onClick={() => onOpenEvent(ev)} style={{ ...styles.tgBlock, top: p.top, height: p.height, left, width }}>
                      <div style={styles.tgBlockTime}>{shortTime(new Date(ev.start_time))}</div>
                      <div style={styles.tgBlockTitle}>{ev.title}</div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---- styles -------------------------------------------------------------

const styles = {
  tgCard: { background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '12px', overflow: 'hidden' },
  tgHeaderRow: { display: 'flex', borderBottom: '0.5px solid #2a2a2a' },
  tgGutterHead: { width: '52px', flexShrink: 0 },
  tgHeadCell: { flex: 1, background: 'transparent', border: 'none', borderLeft: '0.5px solid #232323', padding: '8px 4px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  tgAllDayRow: { display: 'flex', borderBottom: '0.5px solid #2a2a2a', minHeight: '30px' },
  tgAllDayLabel: { width: '52px', flexShrink: 0, fontSize: '9px', color: '#555', textAlign: 'right', paddingRight: '6px', paddingTop: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  tgAllDayCol: { flex: 1, borderLeft: '0.5px solid #232323', padding: '4px', display: 'flex', flexDirection: 'column', gap: '3px' },
  tgAllDayChip: { textAlign: 'left', background: 'rgba(201,168,76,0.14)', borderLeft: `2px solid ${GOLD}`, borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: '3px', padding: '3px 6px', fontSize: '10px', color: '#e7d9a8', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Montserrat, sans-serif' },
  tgScroll: { maxHeight: '560px', overflowY: 'auto' },
  tgGutter: { width: '52px', flexShrink: 0, position: 'relative' },
  tgHourLabel: { position: 'absolute', right: '6px', fontSize: '10px', color: '#555', transform: 'translateY(-50%)' },
  tgCol: { flex: 1, position: 'relative', borderLeft: '0.5px solid #232323' },
  tgHourLine: { position: 'absolute', left: 0, right: 0, borderTop: '0.5px solid #202020' },
  tgNowLine: { position: 'absolute', left: 0, right: 0, height: '2px', background: GOLD, zIndex: 5 },
  tgBlock: { position: 'absolute', background: 'rgba(201,168,76,0.16)', borderLeft: `2px solid ${GOLD}`, borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: '4px', padding: '3px 6px', textAlign: 'left', cursor: 'pointer', overflow: 'hidden', zIndex: 2, fontFamily: 'Montserrat, sans-serif' },
  tgBlockTime: { fontSize: '9px', color: GOLD, fontWeight: '700' },
  tgBlockTitle: { fontSize: '11px', color: '#e7d9a8', lineHeight: 1.2, overflow: 'hidden' },
  controls: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' },
  controlsLeft: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  todayBtn: { padding: '7px 14px', borderRadius: '8px', background: 'transparent', border: `0.5px solid ${GOLD}`, color: GOLD, fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  segmented: { display: 'flex', background: '#0A0A0A', border: '0.5px solid #333', borderRadius: '8px', padding: '3px', gap: '2px' },
  segBtn: { padding: '6px 14px', borderRadius: '6px', background: 'transparent', border: 'none', color: '#888', fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  segBtnOn: { background: GOLD, color: '#0A0A0A' },
  monthCard: { background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '12px', padding: '14px' },
  monthGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' },
  monthCell: { minHeight: '88px', border: '0.5px solid #232323', borderRadius: '6px', padding: '4px', display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' },
  monthNum: { width: '24px', height: '24px', flexShrink: 0, borderRadius: '50%', border: 'none', background: 'transparent', fontSize: '12px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  monthChip: { textAlign: 'left', background: 'rgba(201,168,76,0.14)', borderLeft: `2px solid ${GOLD}`, borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: '3px', padding: '2px 5px', fontSize: '10px', color: '#e7d9a8', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Montserrat, sans-serif', width: '100%' },
  monthMore: { textAlign: 'left', background: 'transparent', border: 'none', color: '#888', fontSize: '10px', cursor: 'pointer', padding: '0 5px', fontFamily: 'Montserrat, sans-serif' },
  weekWrap: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', alignItems: 'start' },
  weekCol: { background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '10px', overflow: 'hidden', minHeight: '260px', display: 'flex', flexDirection: 'column' },
  weekHead: { background: 'transparent', border: 'none', borderBottom: '0.5px solid #2a2a2a', padding: '8px 4px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  weekDow: { fontSize: '9px', color: '#555', letterSpacing: '0.6px', textAlign: 'center' },
  weekDate: { fontSize: '15px', textAlign: 'center', marginTop: '2px' },
  weekBody: { padding: '6px', display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 },
  weekEmpty: { flex: 1 },
  weekChip: { textAlign: 'left', background: 'rgba(201,168,76,0.14)', borderLeft: `2px solid ${GOLD}`, borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: '4px', padding: '5px 7px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  weekChipTime: { fontSize: '9px', color: GOLD, fontWeight: '700' },
  weekChipTitle: { fontSize: '11px', color: '#e7d9a8', marginTop: '2px', lineHeight: 1.3 },
  dayCol: { display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '520px' },
  page: { padding: '28px 32px', maxWidth: '1080px', display: 'flex', flexDirection: 'column', gap: '18px' },
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
  calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' },
  calWeekday: { textAlign: 'center', fontSize: '10px', color: '#555', letterSpacing: '0.6px', paddingBottom: '4px' },
  calDay: {
    aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
    borderRadius: '7px', border: 'none', background: 'transparent', cursor: 'pointer', position: 'relative',
    fontFamily: 'Montserrat, sans-serif',
  },
  calDot: { position: 'absolute', bottom: '5px', width: '5px', height: '5px', borderRadius: '50%', background: GOLD },
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
  badgeGroup: { display: 'flex', gap: '6px', flexShrink: 0 },
  repeatChip: { fontSize: '9px', fontWeight: '700', padding: '2px 7px', borderRadius: '8px', color: '#aaa', background: '#2a2a2a', display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' },
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

  pickerBtn: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
    background: '#0A0A0A', border: '0.5px solid #333', borderRadius: '8px', color: '#fff',
    fontSize: '13px', fontFamily: 'Montserrat, sans-serif', cursor: 'pointer', textAlign: 'left',
  },
  pickerPop: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60, width: '264px',
    background: '#1E1E1E', border: '0.5px solid #333', borderRadius: '12px', padding: '12px',
    boxShadow: '0 8px 28px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '10px',
  },
  timeSelect: {
    width: '100%', padding: '8px 10px', background: '#0A0A0A', border: '0.5px solid #333',
    borderRadius: '8px', color: '#fff', fontSize: '13px', fontFamily: 'Montserrat, sans-serif',
  },
  pickerDone: {
    alignSelf: 'flex-end', padding: '6px 14px', borderRadius: '8px', background: GOLD, color: '#0A0A0A',
    border: 'none', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
  },
  allDayRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  switch: {
    width: '40px', height: '22px', borderRadius: '11px', background: '#333', border: 'none',
    position: 'relative', cursor: 'pointer', padding: 0, flexShrink: 0,
  },
  switchOn: { background: GOLD },
  switchKnob: {
    position: 'absolute', top: '2px', left: '2px', width: '18px', height: '18px', borderRadius: '50%',
    background: '#0A0A0A', transition: 'left 0.15s',
  },
  switchKnobOn: { left: '20px' },
  repeatEndRow: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' },
  repeatInline: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#aaa' },
}
