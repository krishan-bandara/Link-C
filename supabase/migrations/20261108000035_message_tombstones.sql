-- "Delete for everyone" keeps a placeholder ("This message was deleted") like WhatsApp.
-- The server blanks body / sticker and erases the media files, then sets deleted_at; the row stays.
alter table public.messages add column if not exists deleted_at timestamptz;

-- A deleted text message has an empty body, so the "text needs a body" rule must allow it.
alter table public.messages drop constraint if exists messages_check;
alter table public.messages add constraint messages_check
  check (type <> 'text' or deleted_at is not null or char_length(btrim(body)) > 0);

-- Browsers read messages through column grants: without this the history query would be refused (the media_items.hd bug).
grant select (deleted_at) on public.messages to authenticated;

-- A deleted message can no longer be edited.
create or replace function public.edit_message(msg uuid, new_body text)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $function$
declare
  m record;
  b text := btrim(coalesce(new_body, ''));
begin
  if (select auth.uid()) is null or not public.is_active_user() then raise exception 'not allowed'; end if;
  select id, sender_id, type, created_at, conversation_id, body, edited_at, deleted_at into m
    from public.messages where id = msg for update;
  if m.id is null or m.sender_id <> (select auth.uid()) or m.type <> 'text' or m.deleted_at is not null
     or not public.is_participant(m.conversation_id) then
    raise exception 'not allowed';
  end if;
  if m.created_at < now() - interval '15 minutes' then raise exception 'edit window closed'; end if;
  if char_length(b) < 1 or char_length(b) > 4000 then raise exception 'invalid text'; end if;
  if b = m.body then
    return m.edited_at;
  end if;
  update public.messages set body = b, edited_at = now() where id = msg;
  if not found then raise exception 'not allowed'; end if;
  return now();
end $function$;

-- Deleted messages must not trigger SMS alerts.
create or replace function public.sms_candidates_v3(p_offline_seconds integer)
returns table(user_id uuid, conversation_id uuid, first_unread timestamptz, step integer, sms_first_at timestamptz, sms_last_sent_at timestamptz, last_sms_at timestamptz)
language sql
stable security definer
set search_path to ''
as $function$
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
    and m.deleted_at is null
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
$function$;
