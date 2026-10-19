-- "Delete for me": hides ONE message (text, sticker or media) for one person only. The other person keeps it.
-- ("Delete for everyone" is the existing sender-only DELETE /api/messages/[id].)
create table if not exists public.message_hides (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_hides_user_idx on public.message_hides(user_id);
alter table public.message_hides enable row level security;
revoke all on public.message_hides from anon, authenticated;
grant select on public.message_hides to authenticated;
drop policy if exists message_hides_select on public.message_hides;
create policy message_hides_select on public.message_hides for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.hide_message(msg uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
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

-- hidden messages disappear from every read (history, list preview, unread counts, realtime)
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
using (
  public.is_participant(conversation_id)
  and created_at > coalesce(
    (select c.cleared_at from public.conversation_clears c
      where c.conversation_id = messages.conversation_id and c.user_id = (select auth.uid())),
    '-infinity'::timestamptz)
  and not exists (
    select 1 from public.message_hides h
    where h.message_id = messages.id and h.user_id = (select auth.uid()))
);

-- and so do the media records that belong to them
drop policy if exists media_items_select on public.media_items;
create policy media_items_select on public.media_items for select to authenticated
using (
  public.is_participant(conversation_id)
  and created_at > coalesce(
    (select c.cleared_at from public.conversation_clears c
      where c.conversation_id = media_items.conversation_id and c.user_id = (select auth.uid())),
    '-infinity'::timestamptz)
  and not exists (
    select 1 from public.message_hides h
    where h.message_id = media_items.message_id and h.user_id = (select auth.uid()))
);
