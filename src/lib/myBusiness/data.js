// Supabase reads and writes for My Business.
import { supabase } from '../supabase'

export const DEAL_FIELDS = 'fub_deal_id,owner_fub_user_id,side,price,total_commission,is_zillow,lead_source,appt_set_date,appt_met_date,signed_date,under_contract_date,closed_date'

// profile id -> list of Follow Up Boss user ids. leaderboard_agents first,
// then profiles.fub_user_id as the fallback.
export async function fubIdMap() {
  const [{ data: la }, { data: pr }] = await Promise.all([
    supabase.from('leaderboard_agents').select('fub_user_id,profile_id'),
    supabase.from('profiles').select('id,first_name,last_name,account_type,fub_user_id'),
  ])
  const map = {}
  ;(la || []).forEach(r => { if (r.profile_id) (map[r.profile_id] = map[r.profile_id] || []).push(Number(r.fub_user_id)) })
  ;(pr || []).forEach(p => {
    const n = parseInt(p.fub_user_id, 10)
    if (!map[p.id] && !isNaN(n)) map[p.id] = [n]
  })
  return { map, profiles: pr || [] }
}

export async function loadDeals(fubIds) {
  if (!fubIds || !fubIds.length) return []
  const { data, error } = await supabase.from('leaderboard_deals').select(DEAL_FIELDS).in('owner_fub_user_id', fubIds)
  if (error) throw error
  return data || []
}

export async function loadMyPlans(userId) {
  const [{ data: plans, error }, { data: revs }] = await Promise.all([
    supabase.from('mb_plans').select('plan_year,data,committed_at,unlocked').eq('user_id', userId),
    supabase.from('mb_plan_revisions').select('id,plan_year,changed_at,reason,before,after').eq('user_id', userId),
  ])
  if (error) throw error
  return { plans: plans || [], revisions: revs || [] }
}

export async function savePlan(userId, year, entry, goals) {
  const row = { data: entry.data, committed_at: entry.committed_at || null }
  let res
  if (entry.exists) res = await supabase.from('mb_plans').update(row).eq('user_id', userId).eq('plan_year', year)
  else res = await supabase.from('mb_plans').insert({ user_id: userId, plan_year: year, ...row })
  if (res.error) throw res.error
  const g = await supabase.from('mb_plan_goals').upsert(goals, { onConflict: 'user_id,plan_year' })
  if (g.error) throw g.error
}

export async function addRevision(userId, year, reason, before, after) {
  const { data, error } = await supabase.from('mb_plan_revisions')
    .insert({ user_id: userId, plan_year: year, reason, before, after }).select('id,plan_year,changed_at,reason,before,after').single()
  if (error) throw error
  return data
}
