-- Link-C schema. Row Level Security on EVERY table.
-- Tables the browser may touch: profiles, conversations, messages, media_items, location_shares (read only mostly).
-- Everything else is server-only: RLS on, no policy, no grants (service role bypasses RLS).

create extension if not exists pgcrypto with schema extensions;

-- Nothing is readable by default, even for tables created later.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- ---------------------------------------------------------------- invites
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null default 'Member' check (char_length(display_name) between 1 and 40),
  role text not null default 'member' check (role in ('owner', 'member')),
  phone_enc text,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index invites_email_uniq on public.invites (lower(email));
alter table public.invites enable row level security;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Member' check (char_length(display_name) between 1 and 40),
  role text not null default 'member' check (role in ('owner', 'member')),
  phone_enc text,
  sms_alerts_enabled boolean not null default true,
  sms_template text check (sms_template is null or char_length(sms_template) <= 160),
  phone_verified_at timestamptz,
  notice_accepted_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Sign-up is closed at the database level too: an auth user can only be created
-- when the owner has already added a matching invite row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
begin
  select * into inv from public.invites where lower(email) = lower(new.email);
  if not found then
    raise exception 'invite required';
  end if;
  insert into public.profiles (id, display_name, role, phone_enc)
  values (new.id, inv.display_name, inv.role, inv.phone_enc);
  return new;
end;
$$;

create trigger on_auth_user_created
  before insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a <> user_b)
);
create unique index conversations_pair_uniq
  on public.conversations (least(user_a, user_b), greatest(user_a, user_b));
alter table public.conversations enable row level security;

create or replace function public.is_participant(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv and (select auth.uid()) in (c.user_a, c.user_b)
  );
$$;

-- ---------------------------------------------------------------- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  type text not null default 'text' check (type in ('text', 'media', 'system')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  check (type <> 'text' or char_length(btrim(body)) > 0)
);
create index messages_conv_created_idx on public.messages (conversation_id, created_at desc);
create index messages_unread_idx on public.messages (conversation_id) where read_at is null;
alter table public.messages enable row level security;

-- At most 60 messages per minute per user (spam / flood guard that holds even if the app is bypassed).
create or replace function public.enforce_message_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.messages
      where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'rate limit: too many messages';
  end if;
  return new;
end;
$$;
create trigger messages_rate_limit before insert on public.messages
  for each row execute function public.enforce_message_rate();

-- ---------------------------------------------------------------- media
create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0),
  mode text not null check (mode in ('normal', 'once', 'timed')),
  timer_seconds smallint check (timer_seconds is null or timer_seconds between 1 and 10),
  viewed_at timestamptz,
  deleted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index media_items_cleanup_idx on public.media_items (mode, viewed_at, expires_at) where deleted_at is null;
alter table public.media_items enable row level security;

-- Where the encrypted bytes live and the wrapped file key. Never readable by the browser.
create table public.media_keys (
  media_id uuid primary key references public.media_items (id) on delete cascade,
  storage text not null check (storage in ('b2', 'local')),
  object_key text not null,
  wrapped_key text not null,
  plaintext_size bigint not null
);
alter table public.media_keys enable row level security;

create table public.view_events (
  id bigint generated always as identity primary key,
  media_id uuid not null references public.media_items (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  screenshot_flag boolean not null default false
);
alter table public.view_events enable row level security;

create table public.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  mime text not null,
  total_size bigint not null check (total_size > 0),
  chunk_size int not null,
  total_chunks int not null,
  received int[] not null default '{}',
  mode text not null check (mode in ('normal', 'once', 'timed')),
  timer_seconds smallint check (timer_seconds is null or timer_seconds between 1 and 10),
  temp_key_wrapped text not null,
  status text not null default 'uploading' check (status in ('uploading', 'processing', 'done', 'failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.upload_sessions enable row level security;

-- ---------------------------------------------------------------- location (consent based)
create table public.location_shares (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  sharer_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'active', 'declined', 'stopped', 'expired')),
  duration_minutes int check (duration_minutes in (15, 60, 480)),
  expires_at timestamptz,
  last_lat double precision,
  last_lng double precision,
  last_accuracy double precision,
  last_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.location_shares enable row level security;

-- ---------------------------------------------------------------- settings, SMS, presence, audit (server only)
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  photo_max_mb int not null default 10,
  video_max_mb int not null default 300,
  max_inflight_uploads int not null default 2,
  temp_cap_mb int not null default 3072,
  snaps_cap_mb int not null default 2048,
  upload_ttl_minutes int not null default 60
);
insert into public.app_settings default values;
alter table public.app_settings enable row level security;

create table public.sms_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  provider text not null default 'generic-http',
  api_url text,
  http_method text not null default 'POST' check (http_method in ('POST', 'GET')),
  request_format text not null default 'json' check (request_format in ('json', 'form', 'query')),
  body_template text not null default '{"to":"{to}","message":"{text}","from":"{sender}"}',
  headers_template text not null default '{"Authorization":"Bearer {apiKey}"}',
  sender_id text,
  credentials_enc text,
  template_text text not null default 'Service Disk_usage_C Critical (C:/Label Serial Number 7258a5cc: 95% used)'
    check (char_length(template_text) <= 160),
  offline_after_seconds int not null default 120 check (offline_after_seconds >= 30),
  daily_cap int not null default 3,
  monthly_cap int not null default 100,
  quiet_start time,
  quiet_end time,
  updated_at timestamptz not null default now()
);
insert into public.sms_settings default values;
alter table public.sms_settings enable row level security;

create table public.sms_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'alert' check (kind in ('alert', 'test', 'verify')),
  sent_at timestamptz not null default now(),
  provider_status text,
  period_started_at timestamptz
);
alter table public.sms_log enable row level security;

create table public.presence_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  last_sms_at timestamptz,
  sms_sent_this_period boolean not null default false
);
alter table public.presence_state enable row level security;

create table public.phone_verifications (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0
);
alter table public.phone_verifications enable row level security;

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target text,
  at timestamptz not null default now()
);
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------- browser access (explicit, column level)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, public;

grant usage on schema public to authenticated;

-- profiles: never expose phone_enc / sms_template to the browser; role cannot be changed by a user.
grant select (id, display_name, role, sms_alerts_enabled, phone_verified_at, notice_accepted_at, created_at)
  on public.profiles to authenticated;
grant update (display_name, sms_alerts_enabled, notice_accepted_at) on public.profiles to authenticated;

grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;
grant select (id, message_id, conversation_id, sender_id, kind, mime, size_bytes, mode, timer_seconds, viewed_at, deleted_at, expires_at, created_at)
  on public.media_items to authenticated;
grant select on public.location_shares to authenticated;

-- ---------------------------------------------------------------- policies
create policy profiles_select on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.conversations c
    where (select auth.uid()) in (c.user_a, c.user_b) and profiles.id in (c.user_a, c.user_b)
  )
);
create policy profiles_update_own on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy conversations_select on public.conversations for select to authenticated
using ((select auth.uid()) in (user_a, user_b));

create policy messages_select on public.messages for select to authenticated
using (public.is_participant(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and type = 'text'
  and public.is_participant(conversation_id)
);

create policy media_items_select on public.media_items for select to authenticated
using (public.is_participant(conversation_id));

create policy location_shares_select on public.location_shares for select to authenticated
using (public.is_participant(conversation_id));

-- ---------------------------------------------------------------- RPCs (only way to mark delivered / read)
create or replace function public.mark_delivered(conv uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages
     set delivered_at = coalesce(delivered_at, now())
   where conversation_id = conv
     and sender_id <> (select auth.uid())
     and delivered_at is null
     and public.is_participant(conv);
$$;

create or replace function public.mark_read(conv uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages
     set read_at = coalesce(read_at, now()), delivered_at = coalesce(delivered_at, now())
   where conversation_id = conv
     and sender_id <> (select auth.uid())
     and read_at is null
     and public.is_participant(conv);
$$;

revoke all on function public.mark_delivered(uuid), public.mark_read(uuid), public.is_participant(uuid) from public, anon;
grant execute on function public.mark_delivered(uuid), public.mark_read(uuid), public.is_participant(uuid) to authenticated;
revoke all on function public.handle_new_user(), public.enforce_message_rate() from public, anon, authenticated;

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.messages, public.media_items, public.location_shares;

-- Private realtime channels named "conv:<conversation id>" (typing, presence, call signalling).
create policy linkc_conv_channel_read on realtime.messages for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where ('conv:' || c.id::text) = (select realtime.topic())
      and (select auth.uid()) in (c.user_a, c.user_b)
  )
);
create policy linkc_conv_channel_write on realtime.messages for insert to authenticated
with check (
  exists (
    select 1 from public.conversations c
    where ('conv:' || c.id::text) = (select realtime.topic())
      and (select auth.uid()) in (c.user_a, c.user_b)
  )
);
