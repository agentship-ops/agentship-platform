// api/sync-leaderboard.js
// Pulls Follow Up Boss deals (Sisu Sellers + Sisu Buyers) into Supabase.
// Also stores, for My Business: the deal's total commission (FUB commissionValue)
// and the contact's lead source, with is_zillow = source contains "zillow".
// READ-ONLY against Follow Up Boss. Writes only to the leaderboard_deals table.
// Trigger by hand while testing:  /api/sync-leaderboard?token=YOUR_TOKEN
// (reuses the same INTROSPECT_TOKEN you set earlier)

export default async function handler(req, res) {
  try {
    const token = process.env.INTROSPECT_TOKEN;
    const hookOk = req.headers['x-push-secret'] && req.headers['x-push-secret'] === process.env.PUSH_HOOK_SECRET;
    if (!hookOk && (!token || req.query.token !== token)) {
      return res.status(401).json({ error: 'Unauthorized. Call with ?token=YOUR_TOKEN (the same one as before).' });
    }
    const fubKey = process.env.FUB_API_KEY;
    const sbUrl  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const sbKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!fubKey || !sbUrl || !sbKey) {
      return res.status(500).json({ error: 'Missing environment variable', have: { FUB_API_KEY: !!fubKey, SUPABASE_URL: !!sbUrl, SUPABASE_SERVICE_ROLE_KEY: !!sbKey } });
    }

    const auth = 'Basic ' + Buffer.from(fubKey + ':').toString('base64');
    const base = 'https://api.followupboss.com/v1/';
    const dstr = function (v) { return v ? String(v).slice(0, 10) : null; };

    async function fubGet(path) {
      const r = await fetch(base + path, { headers: { Authorization: auth, Accept: 'application/json' } });
      if (!r.ok) throw new Error('Follow Up Boss ' + r.status + ' on ' + path);
      return r.json();
    }

    var allCustomKeys = {};
    var gciKeys = {};
    function findAgentGciKey(d) {
      for (var k in d) {
        if (/^custom/i.test(k)) {
          allCustomKeys[k] = true;
          if (/gci/i.test(k)) gciKeys[k] = true;
        }
      }
      for (var k2 in d) { if (/^custom/i.test(k2) && /agent.*gci/i.test(k2)) return k2; }
      return null;
    }
    function num(v) {
      if (typeof v === 'number') return v;
      if (v != null && !isNaN(parseFloat(v))) return parseFloat(v);
      return null;
    }

    // Lead sources we already know, so each contact is only looked up once.
    var known = {};
    {
      const r = await fetch(sbUrl + '/rest/v1/leaderboard_deals?select=fub_deal_id,lead_source&lead_source=not.is.null', {
        headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
      });
      if (r.ok) { (await r.json()).forEach(function (x) { known[x.fub_deal_id] = x.lead_source; }); }
    }
    var personSource = {};
    var personOf = {};
    function totalCommission(d) {
      var v = num(d.commissionValue);
      if (v != null) return v;
      for (var k in d) { if (/^custom/i.test(k) && /total.*comm/i.test(k) && num(d[k]) != null) return num(d[k]); }
      return null;
    }

    var pipelines = [{ id: 9, side: 'seller' }, { id: 8, side: 'buyer' }];
    var rows = [];
    var scanned = 0;

    for (var pi = 0; pi < pipelines.length; pi++) {
      var p = pipelines[pi];
      var path = 'deals?pipelineId=' + p.id + '&limit=100';
      var pages = 0;
      while (path && pages < 30) {
        var data = await fubGet(path);
        var deals = (data && data.deals) || [];
        for (var i = 0; i < deals.length; i++) {
          var d = deals[i];
          scanned++;
          var gciKey = findAgentGciKey(d);
          var owner = (d.users && d.users[0] && d.users[0].id) || null;
          rows.push({
            fub_deal_id: d.id,
            owner_fub_user_id: owner,
            pipeline_id: d.pipelineId,
            side: p.side,
            stage_id: d.stageId,
            stage_name: d.stageName,
            status: d.status,
            price: num(d.price),
            agent_gci: gciKey ? num(d[gciKey]) : null,
            appt_set_date: dstr(d.custom1stTimeApptSet),
            appt_met_date: dstr(d.custom1stTimeApptMet),
            signed_date: dstr(d.customSignedDate),
            under_contract_date: dstr(d.customUnderContractDate),
            closed_date: (d.stageName === 'Closed') ? dstr(d.enteredStageAt) : null,
            total_commission: totalCommission(d),
            lead_source: known[d.id] != null ? known[d.id] : null,
            is_zillow: known[d.id] != null ? /zillow/i.test(known[d.id]) : false
          });
          var person = (d.people && d.people[0] && d.people[0].id) || (d.contacts && d.contacts[0] && d.contacts[0].id) || null;
          if (person && known[d.id] == null) personOf[d.id] = person;
        }
        var next = data && data._metadata && data._metadata.nextLink;
        path = next ? next.replace(base, '') : null;
        pages++;
      }
    }

    // Look up the contact's source for deals we haven't seen yet (capped per run;
    // the next run picks up the rest, so the first runs backfill everything).
    // Closed deals first, since those drive the P&L.
    var ordered = rows.filter(function (r) { return personOf[r.fub_deal_id]; })
      .sort(function (a, b) { return (b.closed_date ? 1 : 0) - (a.closed_date ? 1 : 0); })
      .map(function (r) { return personOf[r.fub_deal_id]; });
    var toFetch = Array.from(new Set(ordered)).slice(0, 80);
    var lookups = 0;
    for (var q = 0; q < toFetch.length; q += 8) {
      await Promise.all(toFetch.slice(q, q + 8).map(async function (pid) {
        try { var pr = await fubGet('people/' + pid + '?fields=source'); personSource[pid] = (pr && pr.source) || ''; lookups++; }
        catch (e) { /* leave unknown; retried next run */ }
      }));
    }
    rows.forEach(function (r) {
      var pid = personOf[r.fub_deal_id];
      if (pid && personSource[pid] != null) { r.lead_source = personSource[pid]; r.is_zillow = /zillow/i.test(personSource[pid]); }
    });

    async function upsert(batch) {
      const r = await fetch(sbUrl + '/rest/v1/leaderboard_deals', {
        method: 'POST',
        headers: {
          apikey: sbKey,
          Authorization: 'Bearer ' + sbKey,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(batch)
      });
      if (!r.ok) { const t = await r.text(); throw new Error('Supabase ' + r.status + ': ' + t); }
    }
    for (var j = 0; j < rows.length; j += 200) { await upsert(rows.slice(j, j + 200)); }

    var sampleClosed = rows.filter(function (r) { return r.closed_date; }).slice(0, 6).map(function (r) {
      return { deal: r.fub_deal_id, owner: r.owner_fub_user_id, side: r.side, price: r.price, agent_gci: r.agent_gci, total_commission: r.total_commission, lead_source: r.lead_source, closed_date: r.closed_date };
    });

    return res.status(200).json({
      ok: true,
      scanned: scanned,
      upserted: rows.length,
      lead_source_lookups: lookups,
      lead_sources_still_unknown: rows.filter(function (r) { return r.lead_source == null; }).length,
      zillow_deals: rows.filter(function (r) { return r.is_zillow; }).length,
      detected_agent_gci_field: Object.keys(gciKeys),
      all_custom_fields_seen: Object.keys(allCustomKeys),
      sample_closed_deals: sampleClosed
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
