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
     )
   where id = p_session
  returning received;
$$;

create or replace function public.sms_candidates(p_offline_seconds int)
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
    and r.sms_alerts_enabled
    and r.phone_enc is not null
    and r.phone_verified_at is not null
    and coalesce(p.sms_sent_this_period, false) = false
    and (p.last_sms_at is null or p.last_sms_at < now() - interval '5 minutes')
    and coalesce(p.last_seen_at, '-infinity'::timestamptz) < now() - make_interval(secs => p_offline_seconds)
  group by r.id;
$$;

revoke all on function public.append_chunk(uuid, int), public.sms_candidates(int) from public, anon, authenticated;
grant execute on function public.append_chunk(uuid, int), public.sms_candidates(int) to service_role;
