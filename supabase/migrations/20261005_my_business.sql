-- My Business: yearly business plan, goal tracker, agent P&L, net worth, leader view.
-- Safe to re-run (guards everywhere). Does not touch finance_pnl_* (company P&L) or the leaderboard.

-- 1. Two more fields on Follow Up Boss deals (filled by api/sync-leaderboard.js)
alter table public.leaderboard_deals add column if not exists lead_source text;
alter table public.leaderboard_deals add column if not exists is_zillow boolean not null default false;
alter table public.leaderboard_deals add column if not exists total_commission numeric;

-- 2. Helpers
create or replace function public.is_leader_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_account_type() in ('admin','leader'), false)
$$;

create or replace function public.mb_today()
returns date language sql stable as $$
  select (now() at time zone 'America/New_York')::date
$$;

-- A year can be created if it is this year or earlier, or next year from October 1.
create or replace function public.mb_year_creatable(p_year int)
returns boolean language sql stable as $$
  select p_year <= extract(year from public.mb_today())::int
      or (p_year = extract(year from public.mb_today())::int + 1
          and extract(month from public.mb_today()) >= 10)
$$;

-- A year stays editable through January 31 of the following year, unless an admin unlocked it.
create or replace function public.mb_year_writable(p_user uuid, p_year int)
returns boolean language sql stable security definer set search_path = public as $$
  select public.mb_today() <= make_date(p_year + 1, 1, 31)
      or coalesce((select unlocked from public.mb_plans where user_id = p_user and plan_year = p_year), false)
$$;

-- 3. Private plan data (only the owner can ever read it)
create table if not exists public.mb_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_year int not null,
  data jsonb not null default '{}'::jsonb,
  committed_at timestamptz,
  unlocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_year)
);

-- 4. Shared goals (owner writes, leaders and admins read)
create table if not exists public.mb_plan_goals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_year int not null,
  lane text,
  income_goal numeric,
  transaction_goal int,
  gci_goal numeric,
  sales_volume_goal numeric,
  break_even_deals int,
  take_home_per_deal numeric,
  summary jsonb not null default '{}'::jsonb,
  accountability_self text,
  accountability_leader text,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_year)
);

-- 5. Plan history (owner writes, leaders and admins read)
create table if not exists public.mb_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_year int not null,
  changed_at timestamptz not null default now(),
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mb_plan_revisions_user_year on public.mb_plan_revisions (user_id, plan_year);

-- 6. updated_at and the admin-only unlock guard
create or replace function public.mb_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.mb_guard_plans()
returns trigger language plpgsql as $$
declare allowed boolean := coalesce(current_setting('mb.allow_unlock', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.unlocked and not allowed then new.unlocked := false; end if;
  else
    if new.user_id is distinct from old.user_id or new.plan_year is distinct from old.plan_year then
      raise exception 'A plan cannot be moved to another person or year.';
    end if;
    if new.unlocked is distinct from old.unlocked and not allowed then
      raise exception 'Only an admin can lock or unlock a past plan.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists mb_plans_guard on public.mb_plans;
create trigger mb_plans_guard before insert or update on public.mb_plans
  for each row execute function public.mb_guard_plans();
drop trigger if exists mb_plans_touch on public.mb_plans;
create trigger mb_plans_touch before update on public.mb_plans
  for each row execute function public.mb_touch_updated_at();
drop trigger if exists mb_plan_goals_touch on public.mb_plan_goals;
create trigger mb_plan_goals_touch before update on public.mb_plan_goals
  for each row execute function public.mb_touch_updated_at();
drop trigger if exists mb_plan_revisions_touch on public.mb_plan_revisions;
create trigger mb_plan_revisions_touch before update on public.mb_plan_revisions
  for each row execute function public.mb_touch_updated_at();

create or replace function public.mb_set_plan_unlocked(p_user uuid, p_year int, p_unlocked boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if public.current_account_type() is distinct from 'admin' then
    raise exception 'Only an admin can lock or unlock a plan.';
  end if;
  perform set_config('mb.allow_unlock', 'on', true);
  update public.mb_plans set unlocked = p_unlocked where user_id = p_user and plan_year = p_year;
  perform set_config('mb.allow_unlock', 'off', true);
  return found;
end $$;

create or replace function public.mb_plan_unlocked(p_user uuid, p_year int)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_user = auth.uid() or public.is_leader_or_admin()
    then coalesce((select unlocked from public.mb_plans where user_id = p_user and plan_year = p_year), false)
    else null end
$$;

-- 7. Row Level Security
alter table public.mb_plans enable row level security;
alter table public.mb_plan_goals enable row level security;
alter table public.mb_plan_revisions enable row level security;

drop policy if exists "mb_plans owner select" on public.mb_plans;
create policy "mb_plans owner select" on public.mb_plans for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "mb_plans owner insert" on public.mb_plans;
create policy "mb_plans owner insert" on public.mb_plans for insert to authenticated
  with check (user_id = auth.uid() and public.mb_year_creatable(plan_year));
drop policy if exists "mb_plans owner update" on public.mb_plans;
create policy "mb_plans owner update" on public.mb_plans for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.mb_year_writable(user_id, plan_year));

drop policy if exists "mb_plan_goals read" on public.mb_plan_goals;
create policy "mb_plan_goals read" on public.mb_plan_goals for select to authenticated
  using (user_id = auth.uid() or public.is_leader_or_admin());
drop policy if exists "mb_plan_goals owner insert" on public.mb_plan_goals;
create policy "mb_plan_goals owner insert" on public.mb_plan_goals for insert to authenticated
  with check (user_id = auth.uid() and public.mb_year_creatable(plan_year) and public.mb_year_writable(user_id, plan_year));
drop policy if exists "mb_plan_goals owner update" on public.mb_plan_goals;
create policy "mb_plan_goals owner update" on public.mb_plan_goals for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.mb_year_writable(user_id, plan_year));

drop policy if exists "mb_plan_revisions read" on public.mb_plan_revisions;
create policy "mb_plan_revisions read" on public.mb_plan_revisions for select to authenticated
  using (user_id = auth.uid() or public.is_leader_or_admin());
drop policy if exists "mb_plan_revisions owner insert" on public.mb_plan_revisions;
create policy "mb_plan_revisions owner insert" on public.mb_plan_revisions for insert to authenticated
  with check (user_id = auth.uid() and public.mb_year_writable(user_id, plan_year));

grant select, insert, update on public.mb_plans to authenticated;
grant select, insert, update on public.mb_plan_goals to authenticated;
grant select, insert on public.mb_plan_revisions to authenticated;
grant all on public.mb_plans, public.mb_plan_goals, public.mb_plan_revisions to service_role;
grant execute on function public.is_leader_or_admin(), public.mb_today(), public.mb_year_creatable(int),
  public.mb_year_writable(uuid, int), public.mb_set_plan_unlocked(uuid, int, boolean),
  public.mb_plan_unlocked(uuid, int) to authenticated;
