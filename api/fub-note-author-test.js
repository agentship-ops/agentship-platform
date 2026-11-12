// api/fub-note-author-test.js
// ONE-TIME TEST: can the platform credit a note to the agent instead of the API key owner?
// Locked to the test contact Winston Young. Credits the note to the user Winston is assigned to.
//
//   /api/fub-note-author-test?token=YOUR_TOKEN
//
// Uses INTROSPECT_TOKEN. Delete this file after the test.

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
      return { ok: r.ok, status: r.status, json };
    }

    const found = (((await fub('GET', 'people?name=' + encodeURIComponent(TEST_NAME) + '&limit=10')).json || {}).people || [])
      .filter(p => (p.name || '').trim().toLowerCase() === TEST_NAME.toLowerCase());
    if (found.length !== 1) {
      return res.status(200).json({ problem: 'Expected exactly one contact named ' + TEST_NAME + ', found ' + found.length + '. Nothing was written.' });
    }
    const person = found[0];
    const agentId = person.assignedUserId;
    if (!agentId) return res.status(200).json({ problem: 'Winston is not assigned to anyone. Assign him to yourself and try again. Nothing was written.' });

    const me = (await fub('GET', 'me')).json || {};
    const agent = (await fub('GET', 'users/' + agentId)).json || {};

    const created = await fub('POST', 'notes', {
      personId: person.id,
      userId: agentId,
      subject: 'Nurture (MOTIF) · AUTHOR TEST',
      body: 'TEST from the Agentship platform. Safe to delete. Checking who FUB credits as the author.',
      isHtml: false
    });

    let readBack = null;
    if (created.ok && created.json && created.json.id) {
      readBack = (await fub('GET', 'notes/' + created.json.id)).json;
    }

    return res.status(200).json({
      api_key_belongs_to: me.name || null,
      asked_to_credit: { id: agentId, name: agent.name || null },
      note_saved: created.ok,
      fub_response_status: created.status,
      fub_says_author_is: readBack ? { createdBy: readBack.createdBy || null, createdById: readBack.createdById || null } : null,
      result: !created.ok
        ? 'FUB rejected the note. Nothing else was changed.'
        : (readBack && (readBack.createdById === agentId || readBack.createdBy === agent.name))
          ? 'WORKS: FUB credited the note to the agent.'
          : 'Did not work: FUB still credits the API key owner.'
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
