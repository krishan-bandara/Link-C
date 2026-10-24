-- Review fixes for 20261025000026: fail closed when the access token has no session_id; lock the row in edit_message.
create or replace function public.revoke_my_session(sid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cur uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
begin
  if (select auth.uid()) is null then raise exception 'not allowed'; end if;
  if cur is null then raise exception 'current session unknown, sign in again'; end if;
  if sid = cur then raise exception 'use sign out for this device'; end if;
  delete from auth.sessions where id = sid and user_id = (select auth.uid());
end $$;

create or replace function public.revoke_other_sessions()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer; cur uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
begin
  if (select auth.uid()) is null then raise exception 'not allowed'; end if;
  if cur is null then raise exception 'current session unknown, sign in again'; end if;
  delete from auth.sessions where user_id = (select auth.uid()) and id <> cur;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.edit_message(msg uuid, new_body text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  m record;
  b text := btrim(coalesce(new_body, ''));
begin
  if not public.is_active_user() then raise exception 'not allowed'; end if;
  select id, sender_id, type, created_at, conversation_id into m
    from public.messages where id = msg for update;
  if m.id is null or m.sender_id <> (select auth.uid()) or m.type <> 'text' or not public.is_participant(m.conversation_id) then
    raise exception 'not allowed';
  end if;
  if m.created_at < now() - interval '15 minutes' then raise exception 'edit window closed'; end if;
  if char_length(b) < 1 or char_length(b) > 4000 then raise exception 'invalid text'; end if;
  update public.messages set body = b, edited_at = now() where id = msg;
  if not found then raise exception 'not allowed'; end if;
  return now();
end $$;

revoke all on function public.revoke_my_session(uuid), public.revoke_other_sessions(), public.edit_message(uuid, text) from public, anon;
grant execute on function public.revoke_my_session(uuid), public.revoke_other_sessions(), public.edit_message(uuid, text) to authenticated;
