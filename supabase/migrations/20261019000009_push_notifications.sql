-- Web push: one row per phone/browser that said "Allow", admin-editable text, and the offline-alert query.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

create table if not exists public.push_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  title text not null default 'Notification' check (char_length(title) between 1 and 60),
  body text not null default 'You have a new message.' check (char_length(body) between 1 and 140),
  offline_after_seconds integer not null default 90 check (offline_after_seconds between 60 and 3600),
  updated_at timestamptz not null default now()
);
insert into public.push_settings (id) values (1) on conflict do nothing;
alter table public.push_settings enable row level security;
revoke all on public.push_settings from anon, authenticated;

alter table public.presence_state add column if not exists push_sent_this_period boolean not null default false;
alter table public.presence_state add column if not exists last_push_at timestamptz;

create or replace function public.push_candidates(p_offline_seconds integer)
returns table (user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select r.id
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.profiles r on r.id = case when c.user_a = m.sender_id then c.user_b else c.user_a end
  left join public.presence_state p on p.user_id = r.id
  where m.read_at is null
    and m.type <> 'system'
    and not r.login_disabled
    and exists (select 1 from public.push_subscriptions s where s.user_id = r.id)
    and coalesce(p.push_sent_this_period, false) = false
    and (p.last_push_at is null or p.last_push_at < now() - interval '2 minutes')
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
  group by r.id;
$$;
revoke all on function public.push_candidates(integer) from public, anon, authenticated;
grant execute on function public.push_candidates(integer) to service_role;
