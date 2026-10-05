// Small building blocks shared by every My Business tab.
import { MONTHS, $f } from '../../lib/myBusiness/calc'

const Lock = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor" /><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.3" fill="none" /></svg>
)
const Eye = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6s1.8-3.5 5-3.5S11 6 11 6 9.2 9.5 6 9.5 1 6 1 6z" stroke="currentColor" strokeWidth="1.2" fill="none" /><circle cx="6" cy="6" r="1.5" fill="currentColor" /></svg>
)
export const LockIcon = Lock
export const Private = () => <div className="privacy"><Lock /> Only you see this</div>
export const Shared = () => <div className="privacy shared"><Eye /> Shared with your leader</div>

// Text-like inputs bound to a path in the plan data.
export function Money({ value, onChange, placeholder = '0', label = 'Amount', id }) {
  return (
    <div className="money">
      <input id={id} className="input" inputMode="decimal" value={value ?? ''} placeholder={placeholder} aria-label={label}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}
export function Pct({ value, onChange, placeholder, label, style }) {
  return (
    <div className="pct" style={style}>
      <input className="input" inputMode="decimal" value={value ?? ''} placeholder={placeholder} aria-label={label}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}
export function Text({ value, onChange, placeholder = '', label, id }) {
  return <input id={id} className="input" value={value ?? ''} placeholder={placeholder} aria-label={label || placeholder} onChange={e => onChange(e.target.value)} />
}
export function Freq({ value, onChange }) {
  return (
    <select className="input" aria-label="How often" value={value} onChange={e => onChange(e.target.value)}>
      <option value="mo">Monthly</option><option value="yr">Yearly</option>
    </select>
  )
}
export function MonthSelect({ value, onChange, year, label = 'Month' }) {
  return (
    <div className="field" style={{ maxWidth: 220 }}>
      <label>{label}</label>
      <select className="input" aria-label={label} value={value} onChange={e => onChange(+e.target.value)}>
        {MONTHS.map((mn, i) => <option key={mn} value={i}>{mn} {year}</option>)}
      </select>
    </div>
  )
}
export function Seg({ value, onChange, options }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, l]) => <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  )
}
export const PaceTag = ({ on, children }) => <span className={'tag' + (on ? ' ahead' : '')}>{children ?? (on ? 'On pace' : 'Behind')}</span>

// Line chart (ported from the prototype's lineChart).
export function LineChart({ labels, series, legend, count }) {
  const W = 640, H = 240, l = 58, r = 16, t = 16, b = 30, n = labels.length
  const vals = series.flatMap(s => s.vals)
  let mn = Math.min(0, ...vals), mx = Math.max(0, ...vals); if (mx === mn) mx = mn + 1
  const x = i => (n < 2 ? (l + W - r) / 2 : l + (W - l - r) * (i / (n - 1)))
  const y = v => t + (H - t - b) * (1 - (v - mn) / (mx - mn))
  const fk = v => {
    const a = Math.abs(v), sg = v < 0 ? '-' : ''
    if (count) return String(Math.round(v))
    return a >= 1e6 ? sg + '$' + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? sg + '$' + Math.round(a / 1e3) + 'K' : sg + '$' + Math.round(a)
  }
  const ticks = [mn, (mn + mx) / 2, mx]
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={legend.map(g => g[0]).join(', ') + ' over time'}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{fk(v)}</text>
          </g>
        ))}
        {mn < 0 && <line x1={l} x2={W - r} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeDasharray="2 3" />}
        {series.map((s, si) => (
          <g key={si}>
            {s.vals.length > 0 && <path d={s.vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} fill="none" stroke={s.stroke} strokeWidth={s.w}
              strokeDasharray={s.dash ? (s.dash === true ? '5 4' : s.dash) : undefined} />}
            {s.dots && s.vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="4" fill={s.stroke}><title>{labels[i]}: {count ? Math.round(v) : $f(v)}</title></circle>)}
          </g>
        ))}
        {labels.map((lb, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{lb}</text>)}
      </svg>
      <div className="legend">
        {legend.map(([name, style]) => <span key={name}><i className={style === 'dash' ? 'dash' : undefined} style={style === 'dash' ? undefined : style} />{name}</span>)}
      </div>
    </div>
  )
}

export const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
