-- 1) SMS alerts must ignore messages the person cleared ("Clear chat") or hid ("Delete for me"): the function runs as
--    security definer and so bypasses the row-level rules that hide those messages from the person.
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
    and not exists (select 1 from public.message_hides h where h.message_id = m.id and h.user_id = r.id)
    and not exists (
      select 1 from public.conversation_clears cc
      where cc.conversation_id = m.conversation_id and cc.user_id = r.id and cc.cleared_at >= m.created_at
    )
    and not r.login_disabled
    and r.sms_alerts_enabled
    and r.phone_enc is not null
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
  group by r.id, p.sms_step, p.sms_first_at, p.sms_last_sent_at, p.last_sms_at;
$$;
revoke all on function public.sms_candidates_v2(integer) from public, anon, authenticated;
grant execute on function public.sms_candidates_v2(integer) to service_role;

-- 2) Phone numbers are plain text now: make the "nobody but the server reads them" rule explicit (these revokes change
--    nothing today, they guard against a future broad grant).
revoke select (phone_enc, sms_template) on public.profiles from anon, authenticated;
revoke all on public.invites, public.sms_log, public.audit_log from anon, authenticated;
