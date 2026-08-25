import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// Metrics (Conversations removed for launch; funnel starts at Appointments Set)
const METRICS = ['Appointments Set', 'Appointments Met', 'Signed', 'Under Contract', 'Closed', 'Sales Volume', 'GCI']
const FIELD = ['appt_set_date', 'appt_met_date', 'signed_date', 'under_contract_date', 'closed_date', 'closed_date', 'closed_date']
const BENCH = [null, 0.5, 0.5, 0.75, 0.9, null, null]
const BENCH_SHORT = [null, 'Set to Met', 'Met to Signed', 'Signed to Under Contract', 'Under Contract to Closed', null, null]
const isMoney = (m) => m >= 5
const FLOOR = '2026-01-01'
const GOLD = '#C9A84C'
const TIMEFRAMES = ['Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month', 'This Quarter', 'Q1', 'Q2', 'Q3', 'Q4', 'This Year', 'Last Year', 'All Time']

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function rangeFor(tf) {
  const now = new Date(); const today = ymd(now); const y = now.getFullYear()
  let start = FLOOR, end = today
  const dayShift = (n) => { const d = new Date(now); d.setDate(now.getDate() + n); return d }
  if (tf === 'Today') { start = today }
  else if (tf === 'Yesterday') { start = end = ymd(dayShift(-1)) }
  else if (tf === 'This Week') { const off = (now.getDay() + 6) % 7; start = ymd(dayShift(-off)) }
  else if (tf === 'Last Week') { const off = (now.getDay() + 6) % 7; start = ymd(dayShift(-off - 7)); end = ymd(dayShift(-off - 1)) }
  else if (tf === 'This Month') { start = y + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01' }
  else if (tf === 'Last Month') { const d = new Date(y, now.getMonth(), 1); const s = new Date(y, now.getMonth() - 1, 1); const e = new Date(y, now.getMonth(), 0); start = ymd(s); end = ymd(e) }
  else if (tf === 'This Quarter') { const q = Math.floor(now.getMonth() / 3); start = y + '-' + String(q * 3 + 1).padStart(2, '0') + '-01' }
  else if (tf === 'Q1') { start = y + '-01-01'; end = y + '-03-31' }
  else if (tf === 'Q2') { start = y + '-04-01'; end = y + '-06-30' }
  else if (tf === 'Q3') { start = y + '-07-01'; end = y + '-09-30' }
  else if (tf === 'Q4') { start = y + '-10-01'; end = y + '-12-31' }
  else if (tf === 'This Year') { start = y + '-01-01' }
  else if (tf === 'Last Year') { start = (y - 1) + '-01-01'; end = (y - 1) + '-12-31' }
  else if (tf === 'All Time') { start = FLOOR }
  if (start < FLOOR) start = FLOOR
  return [start, end]
}

export default function Leaderboard() {
  const [deals, setDeals] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const [show, setShow] = useState('agent')
  const [metricSel, setMetricSel] = useState('all')
  const [view, setView] = useState('bar')
  const [showBm, setShowBm] = useState(true)
  const [tf, setTf] = useState('This Year')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const a = await supabase.from('leaderboard_agents').select('fub_user_id,display_name,color,active').eq('active', true)
        const d = await supabase.from('leaderboard_deals').select('owner_fub_user_id,side,price,agent_gci,appt_set_date,appt_met_date,signed_date,under_contract_date,closed_date')
        if (!alive) return
        if (a.error) throw a.error
        if (d.error) throw d.error
        setAgents(a.data || [])
        setDeals(d.data || [])
        setLoading(false)
      } catch (e) {
        if (alive) { setErr(e.message || String(e)); setLoading(false) }
      }
    })()
    return () => { alive = false }
  }, [])

  const html = useMemo(() => {
    if (loading || err) return ''
    return buildViz(deals, agents, { show, metricSel, view, showBm, tf })
  }, [deals, agents, show, metricSel, view, showBm, tf, loading, err])

  const isAgent = show === 'agent'

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', fontFamily: 'Montserrat, sans-serif', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Leaderboard</h2>
          </div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>Everyone across Agentship · live from Follow Up Boss</div>
        </div>
        <select value={tf} onChange={(e) => setTf(e.target.value)} style={sel}>
          {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span><label style={lbl}>Show</label>
            <select value={show} onChange={(e) => setShow(e.target.value)} style={sel}>
              <option value="agent">Agents</option>
              <option value="agentship">Agentship</option>
            </select>
          </span>
          {isAgent && (
            <span><label style={lbl}>Metric</label>
              <select value={metricSel} onChange={(e) => setMetricSel(e.target.value)} style={sel}>
                <option value="all">All Metrics</option>
                {METRICS.map((m, i) => <option key={i} value={String(i)}>{m}</option>)}
              </select>
            </span>
          )}
          {isAgent && (
            <span><label style={lbl}>View</label>
              <select value={view} onChange={(e) => setView(e.target.value)} style={sel}>
                <option value="bar">Bar</option>
                <option value="column">Column</option>
                <option value="pie">Pie</option>
                <option value="line">Line</option>
              </select>
            </span>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#999', cursor: 'pointer' }}>
            <input type="checkbox" checked={showBm} onChange={(e) => setShowBm(e.target.checked)} style={{ accentColor: GOLD, width: 14, height: 14 }} /> Industry Average
          </label>
        </div>
      </div>

      <div style={{ background: '#141414', border: '0.5px solid #222', borderRadius: 12, padding: 22, minHeight: 320 }}>
        {loading && <div style={{ color: '#666', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading…</div>}
        {err && <div style={{ color: '#e07070', fontSize: 13, textAlign: 'center', padding: 40 }}>Couldn’t load leaderboard data. {err}</div>}
        {!loading && !err && <div dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
      <div style={{ fontSize: 10, color: '#444', textAlign: 'right', marginTop: 10 }}>
        <i className="ti ti-refresh" aria-hidden="true" /> Synced from Follow Up Boss
      </div>
    </div>
  )
}

const sel = { background: '#0A0A0A', border: '0.5px solid #333', color: '#fff', fontSize: 12, padding: '7px 10px', borderRadius: 8, fontFamily: 'Montserrat, sans-serif' }
const lbl = { fontSize: 11, color: '#888', marginRight: 4 }

// ---------- pure rendering (returns HTML strings) ----------
function buildViz(deals, agents, s) {
  const [start, end] = rangeFor(s.tf)
  const gtint = (k) => k === 4 ? GOLD : 'rgba(201,168,76,' + (0.34 + k * 0.12).toFixed(2) + ')'
  const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }
  const fmt = (v, m) => isMoney(m) ? (v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + Math.round(v / 1000) + 'k') : ('' + v)

  const byOwner = {}
  for (const d of deals) { const o = d.owner_fub_user_id; (byOwner[o] = byOwner[o] || []).push(d) }

  function value(subset, m) {
    const f = FIELD[m]; let c = 0, sum = 0
    for (const d of subset) { const dt = d[f]; if (dt && dt >= start && dt <= end) { c++; if (m === 5) sum += num(d.price); if (m === 6) sum += num(d.agent_gci) } }
    return m >= 5 ? sum : c
  }
  const aVal = (ag, m) => value(byOwner[ag.fub_user_id] || [], m)
  const tVal = (m) => value(deals, m)
  const conv = (ag, m) => { if (BENCH[m] == null) return null; const p = aVal(ag, m - 1); return p > 0 ? Math.round(aVal(ag, m) / p * 100) : 0 }
  const ranked = (m) => agents.map((a) => ({ a, v: aVal(a, m) })).sort((x, y) => y.v - x.v)
  const pill = (ag, m) => { if (!s.showBm || BENCH[m] == null) return ''; const c = conv(ag, m), bp = Math.round(BENCH[m] * 100), col = c >= bp ? '#6ec46e' : '#e07070'; return '<span style="color:' + col + ';font-weight:700">' + (c >= bp ? '\u25B2' : '\u25BC') + ' ' + c + '%</span>' }
  const convLeg = (ag, m) => { if (!s.showBm || BENCH[m] == null) return '<span style="width:52px;display:inline-block"></span>'; const c = conv(ag, m), bp = Math.round(BENCH[m] * 100), col = c >= bp ? '#6ec46e' : '#e07070'; return '<span style="width:52px;text-align:right;color:' + col + ';font-weight:700;font-size:11px;display:inline-block">' + (c >= bp ? '\u25B2' : '\u25BC') + ' ' + c + '%</span>' }

  function bar(m, cp) {
    const data = ranked(m), mx = Math.max.apply(null, data.map((d) => d.v).concat([1])), isc = BENCH[m] != null && s.showBm
    const rows = data.map((d, i) =>
      '<div style="display:flex;align-items:center;gap:10px;margin:' + (cp ? 5 : 7) + 'px 0"><div style="width:15px;text-align:center;font-size:11px;font-weight:700;color:' + (i === 0 ? GOLD : '#666') + '">' + (i + 1) + '</div><div style="width:' + (cp ? 96 : 130) + 'px;flex-shrink:0;font-size:' + (cp ? 10.5 : 12) + 'px;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + d.a.display_name + '</div><div style="flex:1;height:' + (cp ? 16 : 22) + 'px;background:#1c1c1c;border-radius:4px"><div style="width:' + Math.max(d.v / mx * 100, 2).toFixed(1) + '%;height:100%;background:' + (d.a.color || GOLD) + ';border-radius:4px"></div></div><div style="width:' + (cp ? 46 : 58) + 'px;text-align:right;font-size:' + (cp ? 11 : 13) + 'px;font-weight:700;color:#fff">' + fmt(d.v, m) + '</div>' + (isc ? '<div style="width:52px;text-align:right;font-size:11px">' + pill(d.a, m) + '</div>' : '') + '</div>'
    ).join('')
    const cap = (isc && !cp) ? '<div style="font-size:10.5px;color:#777;margin-top:12px">Percent is each agent’s ' + BENCH_SHORT[m] + ' rate. Standard is ' + Math.round(BENCH[m] * 100) + '%.</div>' : ''
    return rows + cap
  }
  function column(m, cp) {
    const data = ranked(m), mx = Math.max.apply(null, data.map((d) => d.v).concat([1])), isc = BENCH[m] != null && s.showBm, maxH = cp ? 84 : 150
    const cols = data.map((d) =>
      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end"><span style="font-size:' + (cp ? 9 : 11) + 'px;font-weight:700;color:#fff;margin-bottom:3px">' + fmt(d.v, m) + '</span><div style="width:' + (cp ? 60 : 56) + '%;height:' + Math.max(d.v / mx * maxH, 2).toFixed(1) + 'px;background:' + (d.a.color || GOLD) + ';border-radius:4px 4px 0 0"></div><span style="font-size:' + (cp ? 8.5 : 10) + 'px;color:#bbb;margin-top:7px;text-align:center;line-height:1.15">' + d.a.display_name + '</span>' + (isc ? '<span style="font-size:10.5px;margin-top:3px">' + pill(d.a, m) + '</span>' : '') + '</div>'
    ).join('')
    const cap = (isc && !cp) ? '<div style="font-size:10.5px;color:#777;margin-top:14px">Standard is ' + Math.round(BENCH[m] * 100) + '% (' + BENCH_SHORT[m] + ').</div>' : ''
    return '<div style="display:flex;gap:' + (cp ? 4 : 8) + 'px;align-items:flex-end">' + cols + '</div>' + cap
  }
  function pie(m, cp) {
    const data = ranked(m), tot = data.reduce((a, d) => a + d.v, 0) || 1; let acc = 0
    const stops = data.map((d) => { const seg = d.v / tot * 100; const st = (d.a.color || GOLD) + ' ' + acc.toFixed(2) + '% ' + (acc + seg).toFixed(2) + '%'; acc += seg; return st }).join(',')
    const leg = data.map((d) => { const sh = (d.v / tot * 100).toFixed(1); return '<div style="display:flex;align-items:center;gap:8px;margin:6px 0;font-size:' + (cp ? 10 : 12) + 'px"><span style="width:11px;height:11px;border-radius:3px;background:' + (d.a.color || GOLD) + ';flex-shrink:0"></span><span style="flex:1;color:#eee">' + d.a.display_name + '</span><span style="color:#fff;font-weight:600;width:52px;text-align:right">' + fmt(d.v, m) + '</span><span style="color:#888;width:40px;text-align:right">' + sh + '%</span>' + convLeg(d.a, m) + '</div>' }).join('')
    const sz = cp ? 110 : 170
    return '<div style="display:flex;align-items:center;gap:' + (cp ? 14 : 26) + 'px;flex-wrap:wrap"><div style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;background:conic-gradient(' + stops + ');flex-shrink:0;position:relative"><div style="position:absolute;inset:' + (cp ? 22 : 34) + 'px;border-radius:50%;background:#141414;display:flex;align-items:center;justify-content:center;flex-direction:column"><span style="font-size:' + (cp ? 13 : 18) + 'px;font-weight:700">' + fmt(tot, m) + '</span><span style="font-size:9px;color:#777">total</span></div></div><div style="flex:1;min-width:' + (cp ? 170 : 250) + 'px">' + leg + '</div></div>'
  }
  function line(m, cp) {
    const data = ranked(m), fr = [0.1, 0.24, 0.4, 0.58, 0.79, 1.0]
    const maxY = Math.max.apply(null, data.map((d) => d.v).concat([1]))
    const W = 520, H = cp ? 120 : 196, axisW = 38, padT = 8, plotH = H - padT - 6, plotW = W - axisW - 8
    const X = (i) => axisW + i / (fr.length - 1) * plotW, Y = (v) => padT + plotH - v / maxY * plotH
    const yax = [0, 0.5, 1].map((f) => { const y = padT + plotH - f * plotH; return '<text x="' + (axisW - 6) + '" y="' + (y + 3).toFixed(1) + '" font-size="9" fill="#666" text-anchor="end">' + fmt(Math.round(maxY * f), m) + '</text><line x1="' + axisW + '" y1="' + y.toFixed(1) + '" x2="' + (W - 6) + '" y2="' + y.toFixed(1) + '" stroke="#202020"/>' }).join('')
    const lines = data.map((d) => '<polyline points="' + fr.map((f, i) => X(i).toFixed(1) + ',' + Y(d.v * f).toFixed(1)).join(' ') + '" fill="none" stroke="' + (d.a.color || GOLD) + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>').join('')
    const leg = data.map((d) => '<div style="display:flex;align-items:center;gap:6px;margin:4px 0;font-size:' + (cp ? 9 : 11) + 'px;color:#ccc"><span style="width:13px;height:2px;background:' + (d.a.color || GOLD) + ';display:inline-block;flex-shrink:0"></span><span style="flex:1">' + d.a.display_name + '</span>' + convLeg(d.a, m) + '</div>').join('')
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">' + yax + lines + '</svg><div style="margin-top:8px">' + leg + '</div>'
  }
  const chart = (m, cp) => s.view === 'bar' ? bar(m, cp) : s.view === 'column' ? column(m, cp) : s.view === 'pie' ? pie(m, cp) : line(m, cp)

  if (!agents.length) return '<div style="color:#666;font-size:13px;text-align:center;padding:40px">No agents on the board yet.</div>'

  if (s.show === 'agent') {
    if (s.metricSel === 'all') {
      const boxes = METRICS.map((name, m) => '<div style="background:#181818;border:0.5px solid #242424;border-radius:10px;padding:14px 15px"><div style="font-size:12px;font-weight:700;color:' + GOLD + ';margin-bottom:12px">' + name + (m === 6 ? ' <span style="font-size:8.5px;color:#777;font-weight:500">net after splits &amp; referrals</span>' : '') + '</div>' + chart(m, true) + '</div>').join('')
      return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px">' + boxes + '</div>'
    }
    const m = Number(s.metricSel)
    return '<div style="font-size:13px;font-weight:600;margin-bottom:16px">' + METRICS[m] + ' · agents ranked</div>' + chart(m, false)
  }

  // Agentship: company funnel + Sales Volume + Units (all owners count)
  const st = [0, 1, 2, 3, 4], t = st.map((k) => tVal(k)), mx = Math.max.apply(null, t.concat([1]))
  const rows = st.map((k, idx) => {
    const topW = Math.max(t[idx] / mx * 100, 5), botW = Math.max(idx < 4 ? t[idx + 1] / mx * 100 : t[idx] / mx * 100 * 0.7, 4)
    const cp = 'polygon(' + ((100 - topW) / 2).toFixed(1) + '% 0,' + ((100 + topW) / 2).toFixed(1) + '% 0,' + ((100 + botW) / 2).toFixed(1) + '% 100%,' + ((100 - botW) / 2).toFixed(1) + '% 100%)'
    let convTxt = '<div style="width:150px;flex-shrink:0"></div>'
    if (idx > 0 && s.showBm) { const actual = t[idx - 1] > 0 ? Math.round(t[idx] / t[idx - 1] * 100) : 0; const bp = Math.round(BENCH[k] * 100); const col = actual >= bp ? '#6ec46e' : '#e07070'; convTxt = '<div style="width:150px;flex-shrink:0;text-align:right;font-size:10px;color:' + col + '">' + actual + '% vs ' + bp + '% standard</div>' }
    return '<div style="display:flex;align-items:center;gap:12px"><div style="width:150px;text-align:right;font-size:12px;color:#bbb;flex-shrink:0">' + METRICS[k] + '</div><div style="flex:1;position:relative;height:44px"><div style="position:absolute;inset:0;clip-path:' + cp + ';background:' + gtint(idx) + '"></div></div><div style="width:80px;flex-shrink:0;font-size:16px;font-weight:700">' + t[idx] + '</div>' + convTxt + '</div>'
  }).join('')
  const vol = tVal(5), units = tVal(4)
  const cards = '<div style="display:flex;gap:14px;margin-top:22px;flex-wrap:wrap">' +
    '<div style="flex:1;min-width:200px;background:#181818;border:0.5px solid #242424;border-radius:12px;padding:20px;text-align:center"><div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.7px">Total Sales Volume</div><div style="font-size:30px;font-weight:700;color:' + GOLD + ';margin-top:6px">' + fmt(vol, 5) + '</div></div>' +
    '<div style="flex:1;min-width:200px;background:#181818;border:0.5px solid #242424;border-radius:12px;padding:20px;text-align:center"><div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.7px">Units</div><div style="font-size:30px;font-weight:700;color:' + GOLD + ';margin-top:6px">' + units + '</div></div>' +
    '</div>'
  return '<div style="font-size:13px;font-weight:600;margin-bottom:16px">Agentship as a whole · ' + s.tf + '</div><div style="display:flex;flex-direction:column;gap:2px">' + rows + '</div>' + cards + (s.showBm ? '<div style="font-size:10.5px;color:#777;margin-top:14px">Percent beside each stage is the team’s conversion into it versus the industry standard.</div>' : '')
}
