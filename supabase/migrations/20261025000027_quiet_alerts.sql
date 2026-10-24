-- Muted chats make no push and no SMS: unread messages in a chat the person has muted (chat_prefs.muted_until null or in the
-- past = not muted; a future time or 'infinity' = muted) no longer make that person an alert candidate. If ALL their unread
-- messages are in muted chats they are not a candidate at all; otherwise only the unmuted ones count (first_unread too).
-- Do-not-disturb hours are checked by the worker (Colombo time), not here. Everything else is unchanged.

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
    and not exists (
      select 1 from public.chat_prefs cp
      where cp.conversation_id = m.conversation_id and cp.user_id = r.id and cp.muted_until is not null and cp.muted_until > now()
    )
    and not r.login_disabled
    and r.sms_alerts_enabled
    and r.phone_enc is not null
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
  group by r.id, p.sms_step, p.sms_first_at, p.sms_last_sent_at, p.last_sms_at;
$$;
revoke all on function public.sms_candidates_v2(integer) from public, anon, authenticated;
grant execute on function public.sms_candidates_v2(integer) to service_role;

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
    and not exists (
      select 1 from public.chat_prefs cp
      where cp.conversation_id = m.conversation_id and cp.user_id = r.id and cp.muted_until is not null and cp.muted_until > now()
    )
    and not r.login_disabled
    and exists (select 1 from public.push_subscriptions s where s.user_id = r.id)
    and m.created_at > coalesce(p.last_push_at, '-infinity'::timestamptz)
    and (p.last_push_at is null or p.last_push_at < now() - interval '2 minutes')
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
  group by r.id;
$$;
revoke all on function public.push_candidates(integer) from public, anon, authenticated;
grant execute on function public.push_candidates(integer) to service_role;
