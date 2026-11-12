import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import ComingSoon from '../ComingSoon'
import MotifForm, { WeekBoxes } from './MotifForm'

// Command Center, first slice: this week's nurture boxes and the + Nurture button.
// Until MOTIF is switched on (wtd_settings.motif_live), only admins who can edit see this.
// Everyone else keeps seeing the Coming Soon card.

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { Authorization: `Bearer ${session.access_token}` } : {}
}

export default function CommandCenter() {
  const [setup, setSetup] = useState(null)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)

  async function load() {
    try {
      const r = await fetch('/api/nurture?action=setup', { headers: await authHeader() })
      const data = await r.json()
      setSetup(data)
    } catch (e) {
      setFailed(true)
    }
  }
  useEffect(() => { load() }, [])

  if (failed || (setup && !setup.canUse)) {
    return <ComingSoon title="Command Center" icon="ti-layout-dashboard" description="Your leads, calling queue, and pipeline. This is where you win the day." phase="Phase 2" />
  }
  if (!setup) return <div style={{ padding: 32, color: '#8A8A8A', fontFamily: 'Montserrat, sans-serif', fontSize: 13 }}>Loading…</div>

  const total = setup.week.total
  const left = Math.max(0, 15 - total)

  return (
    <div style={st.page}>
      {!setup.live && (
        <div style={st.adminBanner}>
          <i className="ti ti-lock" aria-hidden="true" />
          <span>Admin preview. Agents can’t see this yet. Nurtures you log here are real and update Follow Up Boss.</span>
        </div>
      )}

      <div style={st.head}>
        <div>
          <h1 style={st.title}>Command Center</h1>
          {setup.practice && <div style={st.sub}>Practice run · counting starts Jan 1</div>}
        </div>
        <button onClick={() => setOpen(true)} style={st.addBtn}>
          <i className="ti ti-plus" aria-hidden="true" /> {total >= 15 ? 'Additional nurture' : 'Nurture'}
        </button>
      </div>

      <WeekBoxes total={total} />

      {total < 15 && (
        <div style={st.note}>Only {left} more this week to earn Friday morning.</div>
      )}

      <div style={st.placeholder}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Who to call today</div>
        <div style={{ fontSize: 12, color: '#A8A8A8', lineHeight: 1.5 }}>Leads that need your attention right now will show up here. For scheduled follow-up, work your smart lists in Follow Up Boss.</div>
      </div>

      {open && (
        <MotifForm
          timeframes={setup.timeframes}
          onClose={() => setOpen(false)}
          onSaved={data => setSetup(prev => ({ ...prev, week: data.week }))}
        />
      )}
    </div>
  )
}

const st = {
  page: { padding: '28px 32px', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'Montserrat, sans-serif', color: '#FFFFFF' },
  adminBanner: { display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.5, color: '#E0C97A', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 10, padding: '10px 12px' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { fontSize: 12, color: '#A8A8A8', marginTop: 4 },
  addBtn: { minHeight: 44, padding: '0 18px', borderRadius: 10, border: 'none', background: '#C9A84C', color: '#0A0A0A', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  note: { fontSize: 13, color: '#CFCFCF' },
  placeholder: { padding: 16, border: '1px dashed #333', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 },
}
