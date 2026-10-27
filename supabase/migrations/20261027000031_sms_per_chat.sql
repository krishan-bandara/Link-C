-- SMS alerts are counted PER CHAT: each chat with unread messages for an offline person has its own round of at most 3 SMS
-- (SMS 1, SMS 2, SMS 3). The state used to be one row per person (presence_state.sms_step ...); it now lives here, one row per
-- (person, chat). Opening the app (the heartbeat) deletes the person's rows, so going offline again starts a fresh round.

create table if not exists public.sms_chat_state (
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  step integer not null default 0,
  first_at timestamptz,
  last_sent_at timestamptz,
  last_attempt_at timestamptz,
  primary key (user_id, conversation_id)
);
alter table public.sms_chat_state enable row level security; -- no policies: only the service role (worker, heartbeat) touches it
revoke all on public.sms_chat_state from anon, authenticated;

create or replace function public.sms_candidates_v3(p_offline_seconds integer)
returns table (
  user_id uuid,
  conversation_id uuid,
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
         c.id,
         min(m.created_at),
         coalesce(s.step, 0),
         s.first_at,
         s.last_sent_at,
         s.last_attempt_at
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.profiles r on r.id = case when c.user_a = m.sender_id then c.user_b else c.user_a end
  left join public.presence_state p on p.user_id = r.id
  left join public.sms_chat_state s on s.user_id = r.id and s.conversation_id = c.id
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
  group by r.id, c.id, s.step, s.first_at, s.last_sent_at, s.last_attempt_at;
$$;
revoke all on function public.sms_candidates_v3(integer) from public, anon, authenticated;
grant execute on function public.sms_candidates_v3(integer) to service_role;
