-- Repeating SMS escalation: SMS 1 when offline, SMS 2 after step2_after_minutes, then every repeat_every_minutes
-- after the previous successful SMS, until the person's app sends a heartbeat. All timing is decided by the worker
-- (worker/helpers.ts smsDue); SQL only finds who is offline with an unread message.
alter table public.presence_state add column if not exists sms_last_sent_at timestamptz;

alter table public.sms_settings add column if not exists repeat_every_minutes integer not null default 19
  check (repeat_every_minutes between 1 and 1440);

-- step3_after_minutes is no longer used (column kept).
alter table public.sms_settings drop constraint if exists sms_settings_step3_after_step2;

-- New function; the old public.sms_candidates(integer) stays untouched so an old worker keeps running during deploy.
create or replace function public.sms_candidates_v2(p_offline_seconds integer)
returns table (
  user_id uuid,
  first_unread timestamptz,
  step integer,
  sms_first_at timestamptz,
  sms_last_sent_at timestamptz,
  last_sms_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         min(m.created_at),
         coalesce(p.sms_step, 0),
         p.sms_first_at,
         p.sms_last_sent_at,
         p.last_sms_at
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.profiles r on r.id = case when c.user_a = m.sender_id then c.user_b else c.user_a end
  left join public.presence_state p on p.user_id = r.id
  where m.read_at is null
    and m.type <> 'system'
    and not r.login_disabled
    and r.sms_alerts_enabled
    and r.phone_enc is not null
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
  group by r.id, p.sms_step, p.sms_first_at, p.sms_last_sent_at, p.last_sms_at;
$$;
revoke all on function public.sms_candidates_v2(integer) from public, anon, authenticated;
grant execute on function public.sms_candidates_v2(integer) to service_role;

-- One-off defaults; guarded so a re-run never overwrites values the owner changed in the admin panel.
update public.sms_settings set daily_cap = 10, monthly_cap = 300, offline_after_seconds = 45
 where id = 1 and daily_cap = 3 and monthly_cap = 100;
