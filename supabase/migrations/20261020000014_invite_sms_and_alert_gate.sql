-- 1) The invite link can be texted: allow the 'invite' kind in the SMS log.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.sms_log'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%verify%';
  if c is not null then execute format('alter table public.sms_log drop constraint %I', c); end if;
end $$;
alter table public.sms_log add constraint sms_log_kind_check check (kind in ('alert', 'test', 'verify', 'invite'));

-- 2) Offline alerts no longer wait for a verification code: the owner typed the number in the admin panel.
create or replace function public.sms_candidates(p_offline_seconds integer)
returns table (user_id uuid, first_unread timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, min(m.created_at)
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.profiles r on r.id = case when c.user_a = m.sender_id then c.user_b else c.user_a end
  left join public.presence_state p on p.user_id = r.id
  where m.read_at is null
    and m.type <> 'system'
    and not r.login_disabled
    and r.sms_alerts_enabled
    and r.phone_enc is not null
    and coalesce(p.sms_sent_this_period, false) = false
    and (p.last_sms_at is null or p.last_sms_at < now() - interval '5 minutes')
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
  group by r.id;
$$;
revoke all on function public.sms_candidates(integer) from public, anon, authenticated;
grant execute on function public.sms_candidates(integer) to service_role;
