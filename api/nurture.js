// api/nurture.js
// MOTIF nurtures. The only way a nurture is counted.
//
//   GET  /api/nurture?action=setup          -> can this person use it, FUB timeframes, this week's count
//   GET  /api/nurture?action=search&q=Jor   -> the agent's FUB contacts matching a name
//   POST /api/nurture  { action: 'save', personId, why, timeframeId, outcome }
//
// Every request carries the signed-in person's Supabase token.
// While wtd_settings.motif_live is false, only admins who are not view-only can use it.
//
// Writing to Follow Up Boss:
//   - Uses the agent's own key from Vercel, named FUB_KEY_<FIRSTLAST> (letters only, all caps),
//     after confirming with FUB that the key belongs to that agent. Notes then show the agent's name.
//   - If the key is missing or belongs to someone else, falls back to FUB_API_KEY and puts
//     "Nurture logged by <Agent>" on the note's first line. The nurture still counts.
//   - Only the stage and timeframe are ever changed on the person. Never emails, phones or tags.

const FUB = 'https://api.followupboss.com/v1/'
const ORDER = ['lead', 'attempted contact', 'spoke with customer', 'nurture', 'appointment set', 'met with customer',
  'showing homes', 'listing agreement', 'active listing', 'submitting offers', 'under contract']
const REENTRY = ['closed', 'database']
const CADENCE = { 1: ['Weekly', 'Weekly Nurtures'], 2: ['Bi-Weekly', 'Bi-Weekly Nurtures'], 3: ['Monthly', 'Monthly Nurtures'], 4: ['Quarterly', 'Quarterly Nurtures'], 5: ['Quarterly', 'Quarterly Nurtures'] }
const OUTCOMES = { appt: 'Appointment set', keep: 'Not ready yet, keep in touch', working: 'Already working with me' }

function fubAuth(key) { return 'Basic ' + Buffer.from(key + ':').toString('base64') }

async function fub(key, method, path, body) {
  const r = await fetch(FUB + path, {
    method,
    headers: { Authorization: fubAuth(key), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json; try { json = JSON.parse(text) } catch (e) { json = null }
  if (!r.ok) throw new Error('Follow Up Boss said ' + r.status + ' on ' + method + ' ' + path.split('?')[0])
  return json
}

async function sb(sbUrl, sbKey, path, opts = {}) {
  const r = await fetch(`${sbUrl}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  const text = await r.text()
  let json; try { json = JSON.parse(text) } catch (e) { json = null }
  if (!r.ok) {
    const msg = (json && (json.message || json.hint)) || text || String(r.status)
    throw new Error(msg)
  }
  return json
}

async function personFromRequest(req, sbUrl, sbKey) {
  const auth = req.headers.authorization || ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!jwt) return null
  const u = await fetch(`${sbUrl}/auth/v1/user`, { headers: { apikey: sbKey, Authorization: `Bearer ${jwt}` } })
  if (!u.ok) return null
  const user = await u.json()
  const rows = await sb(sbUrl, sbKey, `profiles?id=eq.${encodeURIComponent(user.id)}&select=id,first_name,last_name,account_type,view_only,fub_user_id`)
  return rows && rows[0] ? rows[0] : null
}

// Today's date and the Saturday that starts its nurture week, in Eastern time.
function easternToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return parts // YYYY-MM-DD
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
function weekStart(iso) {
  const dow = new Date(iso + 'T12:00:00Z').getUTCDay() // Sun 0 .. Sat 6
  return addDays(iso, -((dow + 1) % 7))
}

// Agent's own key, if it's in Vercel and FUB confirms it's theirs.
async function agentKey(profile) {
  const envName = 'FUB_KEY_' + ((profile.first_name || '') + (profile.last_name || '')).toUpperCase().replace(/[^A-Z]/g, '')
  const key = process.env[envName]
  if (!key) return { key: null, reason: 'missing', envName }
  try {
    const me = await fub(key, 'GET', 'me')
    if (me && String(me.id) === String(profile.fub_user_id)) return { key, reason: 'ok', envName }
    return { key: null, reason: 'mismatch', envName }
  } catch (e) {
    return { key: null, reason: 'invalid', envName }
  }
}

function nextStage(current, outcome) {
  const cur = (current || '').trim().toLowerCase()
  if (outcome === 'working' || cur === 'trash') return null
  const target = outcome === 'appt' ? 'Appointment set' : 'Nurture'
  if (REENTRY.includes(cur)) return target
  const ci = ORDER.indexOf(cur), ti = ORDER.indexOf(target.toLowerCase())
  if (ci === -1) return target
  return ci >= ti ? null : target
}

async function weekCount(sbUrl, sbKey, agentId, today) {
  // Count this week, plus anything over 15 carried forward from earlier weeks.
  const start = weekStart(today)
  const from = addDays(start, -7 * 8)
  const rows = await sb(sbUrl, sbKey, `nurtures?agent_id=eq.${agentId}&week_bucket_start=gte.${from}&select=week_bucket_start`) || []
  const byWeek = {}
  rows.forEach(r => { byWeek[r.week_bucket_start] = (byWeek[r.week_bucket_start] || 0) + 1 })
  let carry = 0
  for (let w = from; w < start; w = addDays(w, 7)) {
    carry = Math.max(0, (byWeek[w] || 0) + carry - 15)
  }
  return { thisWeek: byWeek[start] || 0, carriedIn: carry, total: (byWeek[start] || 0) + carry, weekStart: start }
}

export default async function handler(req, res) {
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const teamKey = process.env.FUB_API_KEY
  if (!sbUrl || !sbKey || !teamKey) return res.status(500).json({ error: 'Server is missing its settings.' })

  try {
    const profile = await personFromRequest(req, sbUrl, sbKey)
    if (!profile) return res.status(401).json({ error: 'Please sign in again.' })

    const [settings] = await sb(sbUrl, sbKey, 'wtd_settings?id=eq.1&select=*')
    const isEditingAdmin = profile.account_type === 'admin' && !profile.view_only
    const canUse = !!profile.fub_user_id && !profile.view_only && (settings.motif_live || isEditingAdmin)
    const today = easternToday()
    const action = (req.query.action || (req.body && req.body.action) || '').toString()

    if (action === 'setup') {
      if (!canUse) return res.status(200).json({ canUse: false, live: !!settings.motif_live })
      const tf = await fub(teamKey, 'GET', 'timeframes?limit=100')
      const week = await weekCount(sbUrl, sbKey, profile.id, today)
      return res.status(200).json({
        canUse: true,
        live: !!settings.motif_live,
        practice: today < settings.counting_starts,
        countingStarts: settings.counting_starts,
        today,
        timeframes: (tf.timeframes || []).map(t => ({ id: t.id, name: t.timeframe })),
        week,
      })
    }

    if (!canUse) return res.status(403).json({ error: 'Logging nurtures isn’t turned on for you yet.' })

    if (action === 'search') {
      const q = (req.query.q || '').toString().trim()
      if (q.length < 2) return res.status(200).json({ people: [] })
      const mine = await agentKey(profile)
      const key = mine.key || teamKey
      const data = await fub(key, 'GET', 'people?name=' + encodeURIComponent(q) + '&limit=15&fields=id,name,stage,timeframeId,assignedUserId')
      let people = (data && data.people) || []
      if (!mine.key) people = people.filter(p => String(p.assignedUserId) === String(profile.fub_user_id))
      // Who was already counted in the 365-day window (it restarts on the reset date)?
      let windowStart = addDays(today, -settings.nurture_lookback_days)
      if (today >= settings.nurture_clock_resets && windowStart < settings.nurture_clock_resets) windowStart = settings.nurture_clock_resets
      const ids = people.map(p => p.id)
      let taken = []
      if (ids.length) {
        taken = await sb(sbUrl, sbKey, `nurtures?fub_person_id=in.(${ids.join(',')})&nurture_date=gte.${windowStart}&select=fub_person_id`) || []
      }
      const takenSet = new Set(taken.map(t => String(t.fub_person_id)))
      return res.status(200).json({
        people: people.map(p => ({ id: p.id, name: p.name, stage: p.stage, timeframeId: p.timeframeId, alreadyNurtured: takenSet.has(String(p.id)) })),
      })
    }

    if (action === 'save' && req.method === 'POST') {
      const b = req.body || {}
      const personId = Number(b.personId)
      const why = (b.why || '').toString().trim()
      const timeframeId = Number(b.timeframeId)
      const outcome = b.outcome
      if (!personId || !why || !timeframeId || !OUTCOMES[outcome] || b.opportunity !== true || b.info !== true) {
        return res.status(400).json({ error: 'All five MOTIF boxes are needed to count a nurture.' })
      }

      // 365-day check before touching Follow Up Boss.
      let windowStart = addDays(today, -settings.nurture_lookback_days)
      if (today >= settings.nurture_clock_resets && windowStart < settings.nurture_clock_resets) windowStart = settings.nurture_clock_resets
      const already = await sb(sbUrl, sbKey, `nurtures?fub_person_id=eq.${personId}&nurture_date=gte.${windowStart}&select=id&limit=1`)
      if (already && already.length) return res.status(409).json({ error: 'This person was already counted as a nurture in the last 365 days.' })

      const mine = await agentKey(profile)
      const key = mine.key || teamKey
      const agentName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()

      const person = await fub(key, 'GET', `people/${personId}?fields=id,name,stage,timeframeId,assignedUserId`)
      if (!mine.key && String(person.assignedUserId) !== String(profile.fub_user_id) && profile.account_type !== 'admin') {
        return res.status(403).json({ error: 'That contact isn’t assigned to you in Follow Up Boss.' })
      }

      const tfList = (await fub(teamKey, 'GET', 'timeframes?limit=100')).timeframes || []
      const tf = tfList.find(t => t.id === timeframeId)
      if (!tf) return res.status(400).json({ error: 'That timeframe isn’t in Follow Up Boss.' })

      const stageBefore = person.stage || null
      const newStage = nextStage(stageBefore, outcome)
      const stageAfter = newStage || stageBefore
      const isCurrentClient = ORDER.indexOf((stageAfter || '').toLowerCase()) >= ORDER.indexOf('showing homes')
            // Only stage and timeframe. Never emails, phones, addresses or tags.
      const update = {}
      if (newStage) update.stage = newStage
      if (!isCurrentClient && person.timeframeId !== timeframeId) update.timeframeId = timeframeId
      if (Object.keys(update).length) await fub(key, 'PUT', `people/${personId}`, update)

      const cad = CADENCE[timeframeId] || null
      const lines = [
        mine.key ? 'Nurture (MOTIF) · logged in Agentship' : `Nurture logged by ${agentName} · Agentship`,
        'M · Motivation: ' + why,
        'O · Opportunity: Not working with another agent',
        'T · Timeline: ' + tf.timeframe,
        'I · Info: Phone and email confirmed',
        'F · Follow-up: ' + OUTCOMES[outcome] + ((stageAfter || '').toLowerCase() === 'nurture' && cad ? ' · ' + cad[0] : ''),
      ]
      const note = await fub(key, 'POST', 'notes', { personId, subject: 'Nurture (MOTIF)', body: lines.join('\n'), isHtml: false })

      const row = {
        agent_id: profile.id,
        fub_user_id: Number(profile.fub_user_id),
        fub_person_id: personId,
        person_name: person.name,
        nurture_date: today,
        week_bucket_start: weekStart(today),
        source: ['command_center', 'sheet', 'call_prompt', 'signal'].includes(b.source) ? b.source : 'command_center',
        motif: { why, opportunity: true, info: true, timeframe: tf.timeframe, outcome },
        fub_timeframe_id: timeframeId,
        fub_timeframe: tf.timeframe,
        outcome: outcome === 'appt' ? 'appointment_set' : outcome === 'keep' ? 'keep_in_touch' : 'already_working',
        fub_stage_before: stageBefore,
        fub_stage_after: stageAfter,
        fub_note_id: note && note.id ? note.id : null,
        written_as: mine.key ? 'agent' : 'fallback:' + mine.reason,
      }
      await sb(sbUrl, sbKey, 'nurtures', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) })

      const week = await weekCount(sbUrl, sbKey, profile.id, today)
      let list = cad ? cad[1] : null
      const low = (stageAfter || '').toLowerCase()
      if (low === 'appointment set' || low === 'met with customer' || low === 'spoke with customer') list = 'Watch Leads'
      if (isCurrentClient) list = 'Current Clients'

      return res.status(200).json({
        saved: true,
        person: person.name,
        stageBefore, stageAfter, stageChanged: !!newStage,
        timeframe: isCurrentClient ? null : tf.timeframe,
        smartList: list,
        writtenAs: mine.key ? 'agent' : 'fallback',
        appointment: outcome === 'appt',
        week,
      })
    }

    return res.status(400).json({ error: 'Unknown request.' })
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
}
