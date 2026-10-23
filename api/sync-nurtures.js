// api/sync-nurtures.js
// READ-ONLY against Follow Up Boss. Writes only to leaderboard_nurtures.
// A nurture = a call 90 seconds or longer, OR a logged call whose note contains "nurture".
// Each qualifying call is stored with its lead; the board counts distinct leads per period.
// Runs one date window at a time so it stays fast on the free plan.
//
// Run it:  /api/sync-nurtures?token=YOUR_TOKEN
// Backfill a month:  /api/sync-nurtures?token=YOUR_TOKEN&since=2026-01-01&until=2026-01-31
// With no dates it does the current month.

export default async function handler(req, res) {
  try {
    const token = process.env.INTROSPECT_TOKEN;
    if (!token || req.query.token !== token) {
      return res.status(401).json({ error: 'Unauthorized. Call with ?token=YOUR_TOKEN.' });
    }
    const fubKey = process.env.FUB_API_KEY;
    const sbUrl  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const sbKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!fubKey || !sbUrl || !sbKey) {
      return res.status(500).json({ error: 'Missing environment variable', have: { FUB_API_KEY: !!fubKey, SUPABASE_URL: !!sbUrl, SUPABASE_SERVICE_ROLE_KEY: !!sbKey } });
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const today = now.getUTCFullYear() + '-' + pad(now.getUTCMonth() + 1) + '-' + pad(now.getUTCDate());
    const monthStart = now.getUTCFullYear() + '-' + pad(now.getUTCMonth() + 1) + '-01';
    const since = (req.query.since || monthStart).slice(0, 10);
    const until = (req.query.until || today).slice(0, 10);
    if (since < '2026-01-01') { return res.status(400).json({ error: 'since cannot be earlier than 2026-01-01' }); }

    const auth = 'Basic ' + Buffer.from(fubKey + ':').toString('base64');
    const base = 'https://api.followupboss.com/v1/';
    async function fubGet(path) {
      const r = await fetch(base + path, { headers: { Authorization: auth, Accept: 'application/json' } });
      if (!r.ok) throw new Error('Follow Up Boss ' + r.status + ' on ' + path);
      return r.json();
    }

    const rows = [];
    const usersSeen = {};
    let scanned = 0, dialer = 0, logged = 0, pages = 0, capHit = false;
    let path = 'calls?limit=100&sort=-created';
    while (path) {
      if (pages >= 40) { capHit = true; break; }
      const data = await fubGet(path);
      const calls = (data && data.calls) || [];
      let allOlder = calls.length > 0;
      for (const c of calls) {
        const cdate = String(c.created || c.startedAt || '').slice(0, 10);
        if (!cdate) continue;
        if (cdate >= since) allOlder = false;
        if (cdate < since) continue;      // past the window (sorted newest first)
        if (cdate > until) continue;      // not yet into the window
        scanned++;
        if (c.userId && c.userName) usersSeen[c.userId] = c.userName;
        const owner = c.userId || null;
        const lead = c.personId || null;
        if (!owner || !lead) continue;
        const dur = Number(c.duration);
        const byLength = !isNaN(dur) && dur >= 90;
        const byNote = c.note && /nurture/i.test(String(c.note));
        if (!byLength && !byNote) continue;
        if (byLength) dialer++; else logged++;
        rows.push({
          fub_call_id: c.id,
          owner_fub_user_id: owner,
          person_id: lead,
          nurture_date: String(c.startedAt || c.created).slice(0, 10),
          source: byLength ? 'dialer' : 'logged'
        });
      }
      pages++;
      if (allOlder) break;              // whole page older than the window
      const next = data && data._metadata && data._metadata.nextLink;
      path = next ? next.replace(base, '') : null;
    }

    async function upsert(batch) {
      const r = await fetch(sbUrl + '/rest/v1/leaderboard_nurtures', {
        method: 'POST',
        headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch)
      });
      if (!r.ok) { const t = await r.text(); throw new Error('Supabase ' + r.status + ': ' + t); }
    }
    for (let i = 0; i < rows.length; i += 200) { await upsert(rows.slice(i, i + 200)); }

    const leads = {};
    for (const row of rows) leads[row.owner_fub_user_id + ':' + row.person_id] = true;

    return res.status(200).json({
      ok: true,
      window: { since, until },
      pages_fetched: pages,
      cap_hit: capHit,
      calls_in_window: scanned,
      nurtures_stored: rows.length,
      by_dialer_90s: dialer,
      by_logged_note: logged,
      distinct_lead_rows: Object.keys(leads).length,
      users_seen: usersSeen,
      sample: rows.slice(0, 6)
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
