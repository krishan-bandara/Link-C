-- Fixes from the final security review (DB-2, DB-4, DB-5).

-- A caller with no profile row is NOT an active user (it used to fail open).
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and not p.login_disabled);
$$;

-- A disabled person with a still-valid token can no longer join or write to the private conversation channels.
drop policy if exists linkc_conv_channel_read on realtime.messages;
create policy linkc_conv_channel_read on realtime.messages for select to authenticated
using (
  public.is_active_user()
  and exists (
    select 1 from public.conversations c
    where ('conv:' || c.id::text) = (select realtime.topic())
      and (select auth.uid()) in (c.user_a, c.user_b)
  )
);
drop policy if exists linkc_conv_channel_write on realtime.messages;
create policy linkc_conv_channel_write on realtime.messages for insert to authenticated
with check (
  public.is_active_user()
  and exists (
    select 1 from public.conversations c
    where ('conv:' || c.id::text) = (select realtime.topic())
      and (select auth.uid()) in (c.user_a, c.user_b)
  )
);

-- "Clear chat" also hides the media records of cleared messages.
drop policy if exists media_items_select on public.media_items;
create policy media_items_select on public.media_items for select to authenticated
using (
  public.is_participant(conversation_id)
  and created_at > coalesce(
    (select c.cleared_at from public.conversation_clears c
      where c.conversation_id = media_items.conversation_id and c.user_id = (select auth.uid())),
    '-infinity'::timestamptz)
);

-- SMS alerts skip people whose login is disabled (push already did).
create or replace function public.sms_candidates(p_offline_seconds integer)
returns table (user_id uuid, first_unread timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, min(m.created_at)
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.profiles r on r.id = case when c.user_a = m.sender_id then c.user_b else c.user_a end
  left join public.presence_state p on p.user_id = r.id
  where m.read_at is null
    and m.type <> 'system'
    and not r.login_disabled
    and r.sms_alerts_enabled
    and r.phone_enc is not null
    and r.phone_verified_at is not null
    and coalesce(p.sms_sent_this_period, false) = false
    and (p.last_sms_at is null or p.last_sms_at < now() - interval '5 minutes')
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
  group by r.id;
$$;
revoke all on function public.sms_candidates(integer) from public, anon, authenticated;
grant execute on function public.sms_candidates(integer) to service_role;
