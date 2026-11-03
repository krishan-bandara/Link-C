-- Member tools hardening: every member-facing write function also requires an active user and a real auth.uid().
-- Same signatures, search_path and grants as migrations 8, 11, 26, 29.

create or replace function public.clear_chat(conv uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_active_user() or not public.is_participant(conv) then
    raise exception 'not allowed';
  end if;
  insert into public.conversation_clears (conversation_id, user_id, cleared_at)
  values (conv, (select auth.uid()), now())
  on conflict (conversation_id, user_id) do update set cleared_at = excluded.cleared_at;
end;
$$;
revoke all on function public.clear_chat(uuid) from public, anon;
grant execute on function public.clear_chat(uuid) to authenticated;

create or replace function public.hide_message(msg uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
  if (select auth.uid()) is null or not public.is_active_user() then
    raise exception 'not allowed';
  end if;
  select m.conversation_id into conv from public.messages m where m.id = msg;
  if conv is null or not public.is_participant(conv) then
    raise exception 'not allowed';
  end if;
  insert into public.message_hides (message_id, user_id)
  values (msg, (select auth.uid()))
  on conflict (message_id, user_id) do nothing;
end;
$$;
revoke all on function public.hide_message(uuid) from public, anon;
grant execute on function public.hide_message(uuid) to authenticated;

-- p_until in the past (or now) means unmute
create or replace function public.set_chat_mute(conv uuid, p_until timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  u timestamptz := case when p_until is not null and p_until <= now() then null else p_until end;
begin
  if (select auth.uid()) is null or not public.is_active_user() or not public.is_participant(conv) then
    raise exception 'not allowed';
  end if;
  insert into public.chat_prefs (user_id, conversation_id, muted_until, updated_at)
  values ((select auth.uid()), conv, u, now())
  on conflict (user_id, conversation_id) do update set muted_until = excluded.muted_until, updated_at = now();
end $$;
revoke all on function public.set_chat_mute(uuid, timestamptz) from public, anon;
grant execute on function public.set_chat_mute(uuid, timestamptz) to authenticated;

create or replace function public.set_chat_star(conv uuid, p_starred boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.is_active_user() or not public.is_participant(conv) then
    raise exception 'not allowed';
  end if;
  insert into public.chat_prefs (user_id, conversation_id, starred, updated_at)
  values ((select auth.uid()), conv, coalesce(p_starred, false), now())
  on conflict (user_id, conversation_id) do update set starred = excluded.starred, updated_at = now();
end $$;
revoke all on function public.set_chat_star(uuid, boolean) from public, anon;
grant execute on function public.set_chat_star(uuid, boolean) to authenticated;

-- unchanged text: keep the existing edited_at (no fake "edited" mark, no timestamp bump)
create or replace function public.edit_message(msg uuid, new_body text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  m record;
  b text := btrim(coalesce(new_body, ''));
begin
  if (select auth.uid()) is null or not public.is_active_user() then raise exception 'not allowed'; end if;
  select id, sender_id, type, created_at, conversation_id, body, edited_at into m
    from public.messages where id = msg for update;
  if m.id is null or m.sender_id <> (select auth.uid()) or m.type <> 'text' or not public.is_participant(m.conversation_id) then
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
end $$;
revoke all on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;
