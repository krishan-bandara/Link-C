-- Uploads: remember when the last piece arrived, so abandoned uploads stop counting as "in progress".
alter table public.upload_sessions add column if not exists last_chunk_at timestamptz;

create or replace function public.append_chunk(p_session uuid, p_idx int)
returns int[]
language sql
security definer
set search_path = ''
as $$
  update public.upload_sessions
     set received = (
       select coalesce(array_agg(distinct x order by x), '{}')
       from unnest(array_append(received, p_idx)) as x
     ),
     last_chunk_at = now()
   where id = p_session
  returning received;
$$;

-- Push: a person who is offline gets a push for new unread messages, at most one every 2 minutes.
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
    and not r.login_disabled
    and exists (select 1 from public.push_subscriptions s where s.user_id = r.id)
    and m.created_at > coalesce(p.last_push_at, '-infinity'::timestamptz)
    and (p.last_push_at is null or p.last_push_at < now() - interval '2 minutes')
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
  group by r.id;
$$;
revoke all on function public.push_candidates(integer) from public, anon, authenticated;
grant execute on function public.push_candidates(integer) to service_role;

-- SMS: still offline with unread messages 30 minutes after the last text -> one more (daily and monthly caps still apply).
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
    and (p.last_sms_at is null or p.last_sms_at < now() - interval '30 minutes')
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
  group by r.id;
$$;
revoke all on function public.sms_candidates(integer) from public, anon, authenticated;
grant execute on function public.sms_candidates(integer) to service_role;
