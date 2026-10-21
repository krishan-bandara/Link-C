-- SMS escalation for a person who is offline with unread messages:
--   step 0 -> SMS 1 straight away, step 1 -> SMS 2 ten minutes after SMS 1, step 2 -> SMS 3 thirty minutes after SMS 1, then stop.
-- Opening the app (heartbeat) resets the sequence.
alter table public.presence_state add column if not exists sms_step integer not null default 0;
alter table public.presence_state add column if not exists sms_first_at timestamptz;

drop function if exists public.sms_candidates(integer);
create function public.sms_candidates(p_offline_seconds integer)
returns table (user_id uuid, first_unread timestamptz, step integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, min(m.created_at), coalesce(p.sms_step, 0)
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
    and (p.last_sms_at is null or p.last_sms_at < now() - interval '1 minute') -- spacing for retries after a gateway error
    and (
      (coalesce(p.sms_step, 0) = 0 and coalesce(p.sms_sent_this_period, false) = false)
      or (p.sms_step = 1 and now() >= p.sms_first_at + interval '10 minutes')
      or (p.sms_step = 2 and now() >= p.sms_first_at + interval '30 minutes')
    )
  group by r.id, p.sms_step;
$$;
revoke all on function public.sms_candidates(integer) from public, anon, authenticated;
grant execute on function public.sms_candidates(integer) to service_role;

-- "Immediately": a person counts as online only if the app sent a heartbeat (every 30 s) in the last 45 seconds.
update public.sms_settings set offline_after_seconds = 45 where id = 1;
