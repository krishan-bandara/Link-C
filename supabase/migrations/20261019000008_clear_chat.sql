-- "Clear chat": hides every message up to now for ONE person only. The other person keeps their history.
create table if not exists public.conversation_clears (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cleared_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_clears enable row level security;
revoke all on public.conversation_clears from anon, authenticated;
grant select on public.conversation_clears to authenticated;
drop policy if exists conversation_clears_select on public.conversation_clears;
create policy conversation_clears_select on public.conversation_clears for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.clear_chat(conv uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_participant(conv) then
    raise exception 'not allowed';
  end if;
  insert into public.conversation_clears (conversation_id, user_id, cleared_at)
  values (conv, (select auth.uid()), now())
  on conflict (conversation_id, user_id) do update set cleared_at = excluded.cleared_at;
end;
$$;
revoke all on function public.clear_chat(uuid) from public, anon;
grant execute on function public.clear_chat(uuid) to authenticated;

-- messages the person cleared never come back (list preview, unread counts and history all go through this policy)
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
using (
  public.is_participant(conversation_id)
  and created_at > coalesce(
    (select c.cleared_at from public.conversation_clears c
      where c.conversation_id = messages.conversation_id and c.user_id = (select auth.uid())),
    '-infinity'::timestamptz)
);
