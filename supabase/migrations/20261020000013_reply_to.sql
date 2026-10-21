-- Reply to a message (text, photo, video or sticker). The quoted message must be in the same conversation.
alter table public.messages add column if not exists reply_to uuid references public.messages (id) on delete set null;
alter table public.upload_sessions add column if not exists reply_to uuid references public.messages (id) on delete set null;
grant insert (reply_to) on public.messages to authenticated;

create or replace function public.check_reply_same_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from public.messages m where m.id = new.reply_to and m.conversation_id = new.conversation_id
  ) then
    raise exception 'reply target must be in the same conversation';
  end if;
  return new;
end;
$$;
revoke all on function public.check_reply_same_conversation() from public, anon, authenticated;

drop trigger if exists messages_reply_check on public.messages;
create trigger messages_reply_check before insert on public.messages
for each row execute function public.check_reply_same_conversation();
