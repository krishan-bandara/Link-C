-- Owner-editable SMS escalation schedule and texts (Admin > SMS).
-- step2_after_minutes / step3_after_minutes are measured from the FIRST SMS.
alter table public.sms_settings add column if not exists step2_after_minutes integer not null default 10
  check (step2_after_minutes between 1 and 1440);
alter table public.sms_settings add column if not exists step3_after_minutes integer not null default 30
  check (step3_after_minutes between 1 and 1440);
alter table public.sms_settings add column if not exists template_step2 text
  check (template_step2 is null or char_length(template_step2) <= 160);
alter table public.sms_settings add column if not exists template_step3 text
  check (template_step3 is null or char_length(template_step3) <= 160);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_settings_step3_after_step2' and conrelid = 'public.sms_settings'::regclass
  ) then
    alter table public.sms_settings
      add constraint sms_settings_step3_after_step2 check (step3_after_minutes > step2_after_minutes);
  end if;
end $$;

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
  cross join (select step2_after_minutes, step3_after_minutes from public.sms_settings where id = 1) s
  where m.read_at is null
    and m.type <> 'system'
    and not r.login_disabled
    and r.sms_alerts_enabled
    and r.phone_enc is not null
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
    and (p.last_sms_at is null or p.last_sms_at < now() - interval '1 minute') -- spacing for retries after a gateway error
    and (
      (coalesce(p.sms_step, 0) = 0 and coalesce(p.sms_sent_this_period, false) = false)
      or (p.sms_step = 1 and now() >= p.sms_first_at + make_interval(mins => s.step2_after_minutes))
      or (p.sms_step = 2 and now() >= p.sms_first_at + make_interval(mins => s.step3_after_minutes))
    )
  group by r.id, p.sms_step;
$$;
revoke all on function public.sms_candidates(integer) from public, anon, authenticated;
grant execute on function public.sms_candidates(integer) to service_role;
