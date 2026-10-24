-- Member tools: mute + star (pin) per chat, Do-not-disturb hours, edit message, active sessions, member health, storage stats.
-- All writes from the browser go through security definer functions that check the caller (never direct table writes).

-- ---------------------------------------------------------------- per-chat prefs (mute, star)
create table if not exists public.chat_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  muted_until timestamptz,                       -- null = not muted; 'infinity' = muted until unmuted
  starred boolean not null default false,        -- starred chats are pinned to the top and shown by the Favourites filter
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
alter table public.chat_prefs enable row level security;
revoke all on public.chat_prefs from anon, authenticated;
grant select on public.chat_prefs to authenticated;
drop policy if exists chat_prefs_select on public.chat_prefs;
create policy chat_prefs_select on public.chat_prefs for select to authenticated
  using (user_id = (select auth.uid()) and public.is_participant(conversation_id));
create index if not exists chat_prefs_conv_idx on public.chat_prefs (conversation_id);

-- mute for a chat; p_until null = unmute, 'infinity' = until unmuted
create or replace function public.set_chat_mute(conv uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() or not public.is_participant(conv) then raise exception 'not allowed'; end if;
  insert into public.chat_prefs (user_id, conversation_id, muted_until, updated_at)
  values ((select auth.uid()), conv, p_until, now())
  on conflict (user_id, conversation_id) do update set muted_until = excluded.muted_until, updated_at = now();
end $$;

create or replace function public.set_chat_star(conv uuid, p_starred boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() or not public.is_participant(conv) then raise exception 'not allowed'; end if;
  insert into public.chat_prefs (user_id, conversation_id, starred, updated_at)
  values ((select auth.uid()), conv, coalesce(p_starred, false), now())
  on conflict (user_id, conversation_id) do update set starred = excluded.starred, updated_at = now();
end $$;

revoke all on function public.set_chat_mute(uuid, timestamptz) from public, anon;
revoke all on function public.set_chat_star(uuid, boolean) from public, anon;
grant execute on function public.set_chat_mute(uuid, timestamptz) to authenticated;
grant execute on function public.set_chat_star(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- Do-not-disturb hours (per member, Colombo time)
alter table public.user_prefs add column if not exists dnd_on boolean not null default false;
alter table public.user_prefs add column if not exists dnd_from text not null default '22:00' check (dnd_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.user_prefs add column if not exists dnd_to text not null default '07:00' check (dnd_to ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
grant update (dnd_on, dnd_from, dnd_to) on public.user_prefs to authenticated;

-- ---------------------------------------------------------------- edit message (own text, 15 minutes)
alter table public.messages add column if not exists edited_at timestamptz;

create or replace function public.edit_message(msg uuid, new_body text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  m record;
  b text := btrim(coalesce(new_body, ''));
begin
  if not public.is_active_user() then raise exception 'not allowed'; end if;
  select id, sender_id, type, created_at, conversation_id into m from public.messages where id = msg;
  if m.id is null or m.sender_id <> (select auth.uid()) or m.type <> 'text' or not public.is_participant(m.conversation_id) then
    raise exception 'not allowed';
  end if;
  if m.created_at < now() - interval '15 minutes' then raise exception 'edit window closed'; end if;
  if char_length(b) < 1 or char_length(b) > 4000 then raise exception 'invalid text'; end if;
  update public.messages set body = b, edited_at = now() where id = msg;
  return now();
end $$;
revoke all on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------- active sessions (own devices)
create or replace function public.list_my_sessions()
returns table (id uuid, user_agent text, ip text, created_at timestamptz, last_active timestamptz, is_current boolean)
language sql security definer set search_path = '' as $$
  select s.id, s.user_agent, host(s.ip), s.created_at,
         coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at),
         s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
  from auth.sessions s
  where s.user_id = (select auth.uid()) and (s.not_after is null or s.not_after > now())
  order by 5 desc;
$$;

create or replace function public.revoke_my_session(sid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if sid = nullif((select auth.jwt()) ->> 'session_id', '')::uuid then raise exception 'use sign out for this device'; end if;
  delete from auth.sessions where id = sid and user_id = (select auth.uid());
end $$;

create or replace function public.revoke_other_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from auth.sessions
   where user_id = (select auth.uid()) and id <> coalesce(nullif((select auth.jwt()) ->> 'session_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.list_my_sessions() from public, anon;
revoke all on function public.revoke_my_session(uuid) from public, anon;
revoke all on function public.revoke_other_sessions() from public, anon;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
grant execute on function public.revoke_other_sessions() to authenticated;

-- ---------------------------------------------------------------- member health (owner only)
create or replace function public.admin_member_health()
returns table (id uuid, display_name text, role text, login_disabled boolean, created_at timestamptz,
               last_seen_at timestamptz, last_sign_in_at timestamptz, active_sessions integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'owner') then
    raise exception 'not allowed';
  end if;
  return query
    select p.id, p.display_name, p.role, p.login_disabled, p.created_at,
           ps.last_seen_at, u.last_sign_in_at,
           (select count(*)::int from auth.sessions s where s.user_id = p.id and (s.not_after is null or s.not_after > now()))
    from public.profiles p
    left join public.presence_state ps on ps.user_id = p.id
    left join auth.users u on u.id = p.id
    order by greatest(ps.last_seen_at, u.last_sign_in_at) desc nulls last;
end $$;
revoke all on function public.admin_member_health() from public, anon;
grant execute on function public.admin_member_health() to authenticated;

-- ---------------------------------------------------------------- storage stats (written by the worker, read by Admin via the server)
create table if not exists public.storage_stats (
  id smallint primary key default 1 check (id = 1),
  disk_total_bytes bigint,
  disk_free_bytes bigint,
  media_bytes bigint,          -- normal media kept in Backblaze (sum of plaintext sizes, an estimate)
  assets_bytes bigint,         -- avatars, wallpapers, stickers (estimate)
  snap_bytes bigint,           -- temporary snaps on the server disk
  checked_at timestamptz,
  alert_level text not null default 'ok' check (alert_level in ('ok', 'warn', 'critical')),
  alert_sent_at timestamptz
);
alter table public.storage_stats enable row level security;
revoke all on public.storage_stats from anon, authenticated;
insert into public.storage_stats (id) values (1) on conflict do nothing;

alter table public.app_settings add column if not exists disk_free_alert_pct integer not null default 15 check (disk_free_alert_pct between 1 and 90);
alter table public.app_settings add column if not exists b2_budget_gb integer not null default 10 check (b2_budget_gb between 1 and 100000);
alter table public.app_settings add column if not exists b2_alert_pct integer not null default 80 check (b2_alert_pct between 10 and 99);
