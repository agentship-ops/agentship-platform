// api/fub-motif-test.js
// ONE-TIME TEST for the MOTIF write-back. Locked to the test contact Winston Young.
//
// Step A (read only, changes nothing):
//   /api/fub-motif-test?token=YOUR_TOKEN
//   Shows FUB's exact timeframes and stages, and finds Winston.
//
// Step B (writes to Winston ONLY):
//   /api/fub-motif-test?token=YOUR_TOKEN&write=1
//   Sets Winston's stage to Nurture and timeframe to 0-3 Months, adds a MOTIF note,
//   then compares his record before and after to prove nothing else changed.
//
// Uses the same INTROSPECT_TOKEN as the leaderboard sync. Delete this file after the test.

const TEST_NAME = 'Winston Young';

export default async function handler(req, res) {
  try {
    const token = process.env.INTROSPECT_TOKEN;
    if (!token || req.query.token !== token) {
      return res.status(401).json({ error: 'Unauthorized. Call with ?token=YOUR_TOKEN' });
    }
    const fubKey = process.env.FUB_API_KEY;
    if (!fubKey) return res.status(500).json({ error: 'Missing FUB_API_KEY' });

    const auth = 'Basic ' + Buffer.from(fubKey + ':').toString('base64');
    const base = 'https://api.followupboss.com/v1/';
    async function fub(method, path, body) {
      const r = await fetch(base + path, {
        method,
        headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch (e) { json = text; }
      if (!r.ok) throw new Error('Follow Up Boss ' + r.status + ' on ' + method + ' ' + path + ': ' + text.slice(0, 300));
      return json;
    }

    const timeframes = ((await fub('GET', 'timeframes?limit=100')).timeframes || [])
      .map(t => ({ id: t.id, name: t.timeframe }));
    const stages = ((await fub('GET', 'stages?limit=100')).stages || [])
      .map(s => ({ id: s.id, name: s.name }));

    const found = ((await fub('GET', 'people?name=' + encodeURIComponent(TEST_NAME) + '&limit=10')).people || [])
      .filter(p => (p.name || '').trim().toLowerCase() === TEST_NAME.toLowerCase());
    if (found.length !== 1) {
      return res.status(200).json({
        step: 'A (read only)', timeframes, stages,
        problem: 'Expected exactly one contact named ' + TEST_NAME + ', found ' + found.length + '. Nothing was written.',
        matches: found.map(p => ({ id: p.id, name: p.name }))
      });
    }
    const personId = found[0].id;

    const fields = 'id,name,stage,timeframeId,emails,phones,addresses,tags,assignedUserId,source';
    const snap = p => ({
      name: p.name, stage: p.stage, timeframeId: p.timeframeId,
      emails: p.emails, phones: p.phones, addresses: p.addresses,
      tags: p.tags, assignedUserId: p.assignedUserId, source: p.source
    });
    const before = snap(await fub('GET', 'people/' + personId + '?fields=' + fields));

    if (req.query.write !== '1') {
      return res.status(200).json({
        step: 'A (read only). Nothing was changed.',
        timeframes, stages,
        winston: { id: personId, current: before },
        next: 'If the lists above look right, run Step B by adding &write=1 to the link.'
      });
    }

    const nurture = stages.find(s => s.name.trim().toLowerCase() === 'nurture');
    const tf = timeframes.find(t => /^0\s*-\s*3/.test(t.name));
    if (!nurture || !tf) {
      return res.status(200).json({ step: 'B stopped. Nothing was written.', reason: 'Could not find a stage named Nurture or a 0-3 timeframe.', stages, timeframes });
    }

    // Only stage and timeframe are sent. Never emails, phones, addresses or tags.
    await fub('PUT', 'people/' + personId, { stage: nurture.name, timeframeId: tf.id });

    const note = await fub('POST', 'notes', {
      personId,
      subject: 'Nurture (MOTIF) · TEST',
      body: [
        'TEST from the Agentship platform. Safe to delete.',
        'M · Motivation: Relocating for work (three deep: new job, kids start school in August, wants to be settled first)',
        'O · Opportunity: Not working with another agent',
        'T · Timeline: ' + tf.name,
        'I · Info: Phone and email confirmed',
        'F · Follow-up: Weekly (Weekly Nurtures)',
        'Landed: Not ready yet, keep in touch'
      ].join('\n'),
      isHtml: false
    });

    const after = snap(await fub('GET', 'people/' + personId + '?fields=' + fields));
    const same = k => JSON.stringify(before[k]) === JSON.stringify(after[k]);

    return res.status(200).json({
      step: 'B (wrote to Winston only)',
      changed_as_intended: {
        stage: { before: before.stage, after: after.stage },
        timeframeId: { before: before.timeframeId, after: after.timeframeId, expected: tf.id }
      },
      left_alone: {
        emails: same('emails'), phones: same('phones'), addresses: same('addresses'),
        tags: same('tags'), assignedUserId: same('assignedUserId'), source: same('source')
      },
      note_created: { id: note && note.id, created_by: note && (note.createdBy || note.createdById || null) },
      check_in_fub: 'Open Winston in FUB: confirm the stage, the timeframe, how the note looks, and who it says wrote it.'
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
