-- People kept off the My Agents roster (test accounts, founders who don't sell).
-- Admins add a row here to hide someone; leaders and admins can read it.
create table if not exists public.mb_roster_hidden (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.mb_roster_hidden enable row level security;
create policy "mb_roster_hidden leaders read" on public.mb_roster_hidden for select to authenticated using (public.is_leader_or_admin());
create policy "mb_roster_hidden admins insert" on public.mb_roster_hidden for insert to authenticated with check (public.current_account_type() = 'admin');
grant select, insert on public.mb_roster_hidden to authenticated;
grant all on public.mb_roster_hidden to service_role;
-- Winston Young (formerly the Karin Slaughter test account), Brett Caldwell, Kalie Williams, Melissa Kenck
insert into public.mb_roster_hidden (user_id) values
  ('8b63c87c-e32a-4f87-8443-a7a3646ae78a'),
  ('9fdb0061-1294-4a18-aa7d-17874ebecb87'),
  ('b7690cf6-a36b-4da2-a10b-ebd809dace04'),
  ('a5934e7f-df39-4618-b4df-c3ec64ecb4d4')
on conflict (user_id) do nothing;
