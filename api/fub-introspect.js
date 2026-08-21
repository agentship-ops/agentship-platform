// api/fub-introspect.js  (v2 - pulls CLOSED deals so we can confirm
// the close date, price, commission, and split fields)
// READ-ONLY. Never writes. Delete this file once you've pasted the output.

export default async function handler(req, res) {
  const token = process.env.INTROSPECT_TOKEN;
  if (!token || req.query.token !== token) {
    return res.status(401).json({
      error: 'Unauthorized. Call this URL with ?token=YOUR_INTROSPECT_TOKEN.',
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

  // Sisu Sellers Closed = stage 90, Sisu Buyers Closed = stage 80.
  const [closedSellers, closedBuyers] = await Promise.all([
    get('deals?pipelineId=9&stageId=90&limit=2'),
    get('deals?pipelineId=8&stageId=80&limit=2'),
  ]);

  res.status(200).json({
    note: 'Closed-deal snapshot. Paste this back to Claude, then delete this file. If either list is empty, tell Claude and he will adjust the query.',
    closedSellerDeals: closedSellers.body,
    closedBuyerDeals: closedBuyers.body,
  });
}
