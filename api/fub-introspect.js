// api/fub-introspect.js
// One-time, READ-ONLY snapshot of your Follow Up Boss structure.
// It never writes anything. Delete this file once you've captured the output.
//
// Setup:
//   1. In Vercel, add an env var INTROSPECT_TOKEN set to any random string (Production).
//   2. Upload this file to the repo at api/fub-introspect.js via GitHub "Upload files".
//   3. Open https://YOUR-DOMAIN/api/fub-introspect?token=YOUR_TOKEN
//   4. Paste the result back. Then delete this file.

export default async function handler(req, res) {
  const token = process.env.INTROSPECT_TOKEN;
  if (!token || req.query.token !== token) {
    return res.status(401).json({
      error: 'Unauthorized. Add INTROSPECT_TOKEN in Vercel and call this URL with ?token=THAT_VALUE.',
    });
  }

  const key = process.env.FUB_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'FUB_API_KEY is not set in the environment.' });
  }

  const auth = 'Basic ' + Buffer.from(key + ':').toString('base64');
  const base = 'https://api.followupboss.com/v1/';

  async function get(path) {
    try {
      const r = await fetch(base + path, {
        headers: { Authorization: auth, Accept: 'application/json' },
      });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      return { status: r.status, body };
    } catch (e) {
      return { error: String(e) };
    }
  }

  const [pipelines, stages, users, deals] = await Promise.all([
    get('pipelines'),
    get('stages'),
    get('users?limit=100'),
    get('deals?limit=3'),
  ]);

  // Trim users to just what we need for linking.
  let trimmedUsers = users.body;
  if (users.body && Array.isArray(users.body.users)) {
    trimmedUsers = users.body.users.map((u) => ({ id: u.id, name: u.name, email: u.email }));
  }

  res.status(200).json({
    note: 'Read-only snapshot of your Follow Up Boss structure. Paste this back to Claude, then delete this file.',
    pipelines: pipelines.body,
    stages: stages.body,
    users: trimmedUsers,
    sampleDeals: deals.body,
  });
}
