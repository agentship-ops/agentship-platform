// api/inspect-calls.js
// READ-ONLY. Pulls a few recent Follow Up Boss calls and shows exactly what
// each one stores, so we can see what a hand-logged call carries.
// Run by hand:  /api/inspect-calls?token=YOUR_TOKEN   (same token as before)

export default async function handler(req, res) {
  try {
    const token = process.env.INTROSPECT_TOKEN;
    if (!token || req.query.token !== token) {
      return res.status(401).json({ error: 'Unauthorized. Call with ?token=YOUR_TOKEN (same one as before).' });
    }
    const fubKey = process.env.FUB_API_KEY;
    if (!fubKey) return res.status(500).json({ error: 'Missing FUB_API_KEY' });

    const auth = 'Basic ' + Buffer.from(fubKey + ':').toString('base64');
    const r = await fetch('https://api.followupboss.com/v1/calls?limit=25&sort=-created', {
      headers: { Authorization: auth, Accept: 'application/json' }
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'Follow Up Boss ' + r.status, body: t.slice(0, 300) });
    }
    const data = await r.json();
    const calls = (data && data.calls) || [];

    // every field name seen across the batch
    const allKeys = {};
    for (const c of calls) for (const k in c) allKeys[k] = true;

    // distinct values of the fields most likely to mark a nurture
    const outcomes = {}, notesPresent = { with_note: 0, without_note: 0 };
    let withDuration = 0, withoutDuration = 0;
    for (const c of calls) {
      const o = c.outcome == null ? '(none)' : String(c.outcome);
      outcomes[o] = (outcomes[o] || 0) + 1;
      if (c.note && String(c.note).trim()) notesPresent.with_note++; else notesPresent.without_note++;
      const d = Number(c.duration);
      if (!isNaN(d) && d > 0) withDuration++; else withoutDuration++;
    }

    return res.status(200).json({
      ok: true,
      total_returned: calls.length,
      all_fields_seen: Object.keys(allKeys),
      outcome_values_seen: outcomes,
      notes: notesPresent,
      duration_present: withDuration,
      duration_blank: withoutDuration,
      first_five_full: calls.slice(0, 5)
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
