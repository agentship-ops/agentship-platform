// api/inspect-call-sources.js
// READ-ONLY. Shows, per agent, how their calls arrive: how many have a length,
// how many don't, and which system logged them. Tells us whether cell calls
// reach the API at all. Looks at roughly the last 45 days unless given dates.
//
// Run it:  /api/inspect-call-sources?token=YOUR_TOKEN
// Or a window:  /api/inspect-call-sources?token=YOUR_TOKEN&since=2026-09-01&until=2026-10-23

export default async function handler(req, res) {
  try {
    const token = process.env.INTROSPECT_TOKEN;
    if (!token || req.query.token !== token) return res.status(401).json({ error: 'Unauthorized. Call with ?token=YOUR_TOKEN.' });
    const fubKey = process.env.FUB_API_KEY;
    if (!fubKey) return res.status(500).json({ error: 'Missing FUB_API_KEY' });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    const d45 = new Date(now); d45.setUTCDate(now.getUTCDate() - 45);
    const since = (req.query.since || ymd(d45)).slice(0, 10);
    const until = (req.query.until || ymd(now)).slice(0, 10);

    const auth = 'Basic ' + Buffer.from(fubKey + ':').toString('base64');
    const base = 'https://api.followupboss.com/v1/';
    async function fubGet(path) {
      const r = await fetch(base + path, { headers: { Authorization: auth, Accept: 'application/json' } });
      if (!r.ok) throw new Error('Follow Up Boss ' + r.status + ' on ' + path);
      return r.json();
    }

    const byUser = {};
    const systemsOverall = {};
    let scanned = 0, pages = 0, capHit = false;
    const afiyfaSamples = [];
    let path = 'calls?limit=100&createdAfter=' + encodeURIComponent(since + 'T00:00:00Z') + '&createdBefore=' + encodeURIComponent(until + 'T23:59:59Z');
    while (path) {
      if (pages >= 30) { capHit = true; break; }
      const data = await fubGet(path);
      const calls = (data && data.calls) || [];
      for (const c of calls) {
        scanned++;
        const uid = c.userId || 0;
        const name = c.userName || ('user ' + uid);
        const sys = c.systemName || '(no system name)';
        const dur = Number(c.duration);
        const hasDur = !isNaN(dur) && dur > 0;
        const is90 = !isNaN(dur) && dur >= 90;
        if (!byUser[uid]) byUser[uid] = { name: name, total: 0, with_length: 0, length_90plus: 0, no_length: 0, systems: {} };
        const u = byUser[uid];
        u.total++;
        if (hasDur) u.with_length++; else u.no_length++;
        if (is90) u.length_90plus++;
        u.systems[sys] = (u.systems[sys] || 0) + 1;
        systemsOverall[sys] = (systemsOverall[sys] || 0) + 1;
        if (uid === 18 && afiyfaSamples.length < 5) afiyfaSamples.push({ id: c.id, created: c.created, duration: c.duration, systemName: c.systemName, systemId: c.systemId, note: c.note ? String(c.note).slice(0, 40) : null, isIncoming: c.isIncoming });
      }
      pages++;
      const next = data && data._metadata && data._metadata.nextLink;
      path = next ? next.replace(base, '') : null;
    }

    return res.status(200).json({
      ok: true,
      window: { since, until },
      pages_fetched: pages,
      cap_hit: capHit,
      calls_scanned: scanned,
      systems_overall: systemsOverall,
      per_agent: byUser,
      afiyfa_samples: afiyfaSamples
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
