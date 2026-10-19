-- Security hardening, part A (from the security review). Safe to run while the app is running.

-- invites: a server-only claim secret, set just before the account is created (used by part B)
alter table public.invites add column if not exists claim_secret text;
alter table public.invites add column if not exists claim_expires timestamptz;

-- end every session of a user EXCEPT one (used after a password change)
create or replace function public.revoke_other_sessions(p_user uuid, p_keep uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user and id <> p_keep;
$$;
revoke all on function public.revoke_other_sessions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_other_sessions(uuid, uuid) to service_role;

-- atomic login attempt reservation: the attempt is counted FIRST, so parallel guesses cannot all slip through
create or replace function public.reserve_login_attempt(p_key text, p_max int, p_lock_minutes int)
returns table (allowed boolean, fails int, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.login_attempts%rowtype;
begin
  insert into public.login_attempts as l (email_hash, fails, locked_until, updated_at)
  values (p_key, 1, null, now())
  on conflict (email_hash) do update set
    fails = case when l.locked_until is not null and l.locked_until <= now() then 1 else l.fails + 1 end,
    locked_until = case
      when l.locked_until is not null and l.locked_until > now() then l.locked_until
      when (case when l.locked_until is not null and l.locked_until <= now() then 1 else l.fails + 1 end) > p_max
        then now() + make_interval(mins => p_lock_minutes)
      else null end,
    updated_at = now()
  returning * into r;
  return query select (r.fails <= p_max and r.locked_until is null), r.fails, r.locked_until;
end;
$$;
revoke all on function public.reserve_login_attempt(text, int, int) from public, anon, authenticated;
grant execute on function public.reserve_login_attempt(text, int, int) to service_role;

-- a disabled person loses direct database access at once, even with a token that has not expired yet
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce((select p.login_disabled from public.profiles p where p.id = (select auth.uid())), false);
$$;
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

create or replace function public.is_participant(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user() and exists (
    select 1 from public.conversations c
    where c.id = conv and (select auth.uid()) in (c.user_a, c.user_b)
  );
$$;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
using ((select auth.uid()) in (user_a, user_b) and public.is_active_user());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  public.is_active_user() and (
    id = (select auth.uid())
    or exists (
      select 1 from public.conversations c
      where (select auth.uid()) in (c.user_a, c.user_b) and profiles.id in (c.user_a, c.user_b)
    )
  )
);

drop policy if exists user_prefs_select on public.user_prefs;
create policy user_prefs_select on public.user_prefs for select to authenticated
using (user_id = (select auth.uid()) and public.is_active_user());
drop policy if exists user_prefs_update on public.user_prefs;
create policy user_prefs_update on public.user_prefs for update to authenticated
using (user_id = (select auth.uid()) and public.is_active_user())
with check (user_id = (select auth.uid()) and public.is_active_user());
