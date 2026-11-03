-- Link-C RLS tests. Run against a DEV/TEST database only, e.g.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
-- Everything runs inside a transaction that is rolled back, so nothing is kept.
-- Any failed check raises an exception; success prints NOTICE 'ALL RLS TESTS PASSED'.
\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------- helpers (live in this session only)
-- true when running the statement is refused (permission denied / RLS violation)
create function pg_temp.denied(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

create function pg_temp.cnt(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || q || ') s' into n;
  return n;
end $$;

-- rows visible, or 0 when the table is not even readable
create function pg_temp.visible(q text) returns bigint language plpgsql as $$
begin
  return pg_temp.cnt(q);
exception when insufficient_privilege then
  return 0;
end $$;

create function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'RLS TEST FAILED: %', msg; end if;
end $$;

-- ---------------------------------------------------------------- fixtures (as the connecting admin role)
-- migration 7: sign-up needs the one-time claim secret on the invite AND the same value in user metadata
insert into public.invites (email, display_name, role, claim_secret, claim_expires) values
  ('rls-owner@test.invalid', 'Owner', 'owner', 'rls-claim', now() + interval '1 hour'),
  ('rls-a@test.invalid', 'Alice', 'member', 'rls-claim', now() + interval '1 hour'),
  ('rls-b@test.invalid', 'Bob', 'member', 'rls-claim', now() + interval '1 hour'),
  ('rls-c@test.invalid', 'Carol', 'member', 'rls-claim', now() + interval '1 hour');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a0', 'rls-owner@test.invalid', '{"claim":"rls-claim"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'rls-a@test.invalid', '{"claim":"rls-claim"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'rls-b@test.invalid', '{"claim":"rls-claim"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'rls-c@test.invalid', '{"claim":"rls-claim"}');

insert into public.conversations (id, user_a, user_b) values
  ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');

insert into public.messages (id, conversation_id, sender_id, body, type) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', 'hello bob', 'text'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', '', 'media');

insert into public.media_items (id, message_id, conversation_id, sender_id, kind, mime, size_bytes, mode) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c0a1',
   '00000000-0000-0000-0000-0000000000a1', 'image', 'image/jpeg', 1000, 'normal');
insert into public.media_keys (media_id, storage, object_key, wrapped_key, plaintext_size) values
  ('00000000-0000-0000-0000-0000000000e1', 'local', 'aaaaaaaaaaaaaaaaaaaa', 'wrapped', 1000);

-- sanity: the invite trigger created the profiles
select pg_temp.assert(pg_temp.cnt('select 1 from public.profiles where id in (''00000000-0000-0000-0000-0000000000a0'',''00000000-0000-0000-0000-0000000000a1'',''00000000-0000-0000-0000-0000000000b1'',''00000000-0000-0000-0000-0000000000c1'')') = 4,
  'fixture profiles were not created');

-- uninvited sign-up is rejected by the database itself
do $$
begin
  begin
    insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'stranger@test.invalid');
    raise exception 'RLS TEST FAILED: uninvited sign-up was allowed';
  exception when others then
    if sqlerrm like 'RLS TEST FAILED%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------- user C (outsider)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

select pg_temp.assert(pg_temp.visible('select 1 from public.conversations') = 0, 'C can see A/B conversation');
select pg_temp.assert(pg_temp.visible('select 1 from public.messages') = 0, 'C can see A/B messages');
select pg_temp.assert(pg_temp.visible('select 1 from public.media_items') = 0, 'C can see A/B media_items');
select pg_temp.assert(pg_temp.visible('select 1 from public.profiles where id <> auth.uid()') = 0, 'C can see other profiles');
select pg_temp.assert(pg_temp.visible('select 1 from public.profiles where id = auth.uid()') = 1, 'C cannot see own profile');
select pg_temp.assert(pg_temp.denied($q$insert into public.messages (conversation_id, sender_id, body)
  values ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000c1', 'let me in')$q$),
  'C inserted a message into A/B conversation');

-- ---------------------------------------------------------------- user A (member in the conversation)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select pg_temp.assert(pg_temp.visible('select 1 from public.messages') = 2, 'A cannot see own conversation messages');
select pg_temp.assert(pg_temp.visible('select 1 from public.media_items') = 1, 'A cannot see own media_items');
select pg_temp.assert(pg_temp.visible('select 1 from public.profiles where id = ''00000000-0000-0000-0000-0000000000b1''') = 1, 'A cannot see B profile');
select pg_temp.assert(pg_temp.visible('select 1 from public.profiles where id = ''00000000-0000-0000-0000-0000000000c1''') = 0, 'A can see unrelated C profile');

-- legitimate insert works
select pg_temp.assert(not pg_temp.denied($q$insert into public.messages (conversation_id, sender_id, body)
  values ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', 'second message')$q$),
  'A could not send a normal message');
-- as someone else
select pg_temp.assert(pg_temp.denied($q$insert into public.messages (conversation_id, sender_id, body)
  values ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000b1', 'fake from bob')$q$),
  'A inserted a message as B');
-- forbidden types
select pg_temp.assert(pg_temp.denied($q$insert into public.messages (conversation_id, sender_id, body, type)
  values ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', 'x', 'system')$q$),
  'A inserted a system message');
select pg_temp.assert(pg_temp.denied($q$insert into public.messages (conversation_id, sender_id, body, type)
  values ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', 'x', 'media')$q$),
  'A inserted a media message');
-- no direct edits or deletes
select pg_temp.assert(pg_temp.denied($q$update public.messages set body = 'edited' where id = '00000000-0000-0000-0000-0000000000f1'$q$),
  'A updated a message directly');
select pg_temp.assert(pg_temp.denied($q$update public.messages set read_at = now() where id = '00000000-0000-0000-0000-0000000000f1'$q$),
  'A set read_at directly');
select pg_temp.assert(pg_temp.denied($q$delete from public.messages where id = '00000000-0000-0000-0000-0000000000f1'$q$),
  'A deleted a message directly');
-- role escalation
select pg_temp.assert(pg_temp.denied($q$update public.profiles set role = 'owner' where id = auth.uid()$q$),
  'A changed own role');
select pg_temp.assert(pg_temp.denied($q$update public.profiles set phone_enc = 'x' where id = auth.uid()$q$),
  'A changed own phone_enc');
select pg_temp.assert(pg_temp.denied('select phone_enc from public.profiles'), 'A can read phone_enc');
select pg_temp.assert(not pg_temp.denied($q$update public.profiles set display_name = 'Alice2' where id = auth.uid()$q$),
  'A could not rename self');
-- updating someone else's profile touches 0 rows
do $$
declare n int;
begin
  update public.profiles set display_name = 'hacked' where id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS TEST FAILED: A renamed B'; end if;
end $$;

-- mark_read as the sender must not change anything
select public.mark_read('00000000-0000-0000-0000-00000000c0a1');

-- ---------------------------------------------------------------- server-only tables (as A, then anon)
select pg_temp.assert(pg_temp.visible('select 1 from public.invites') = 0, 'A reads invites');
select pg_temp.assert(pg_temp.visible('select 1 from public.sms_settings') = 0, 'A reads sms_settings');
select pg_temp.assert(pg_temp.visible('select 1 from public.audit_log') = 0, 'A reads audit_log');
select pg_temp.assert(pg_temp.visible('select 1 from public.media_keys') = 0, 'A reads media_keys');
select pg_temp.assert(pg_temp.visible('select 1 from public.app_settings') = 0, 'A reads app_settings');
select pg_temp.assert(pg_temp.visible('select 1 from public.sms_log') = 0, 'A reads sms_log');
select pg_temp.assert(pg_temp.visible('select 1 from public.presence_state') = 0, 'A reads presence_state');
select pg_temp.assert(pg_temp.visible('select 1 from public.upload_sessions') = 0, 'A reads upload_sessions');
select pg_temp.assert(pg_temp.visible('select 1 from public.phone_verifications') = 0, 'A reads phone_verifications');
select pg_temp.assert(pg_temp.denied($q$insert into public.invites (email) values ('evil@test.invalid')$q$), 'A inserted an invite');
select pg_temp.assert(pg_temp.denied('select * from public.sms_candidates(1)'), 'A can call sms_candidates');

-- ---------------------------------------------------------------- password login (migration 5), as A
select pg_temp.assert(pg_temp.visible('select 1 from public.invite_tokens') = 0, 'A reads invite_tokens');
select pg_temp.assert(pg_temp.visible('select 1 from public.login_attempts') = 0, 'A reads login_attempts');
select pg_temp.assert(pg_temp.denied($q$insert into public.invite_tokens (email, purpose, token_hash, expires_at)
  values ('evil@test.invalid', 'invite', 'x', now() + interval '1 day')$q$), 'A inserted an invite_token');
select pg_temp.assert(pg_temp.denied($q$insert into public.login_attempts (email_hash) values ('x')$q$), 'A inserted login_attempts');
select pg_temp.assert(pg_temp.denied($q$select public.revoke_user_sessions('00000000-0000-0000-0000-0000000000b1')$q$),
  'A can execute revoke_user_sessions');
select pg_temp.assert(pg_temp.denied('select login_disabled from public.profiles'), 'A can read login_disabled');
select pg_temp.assert(pg_temp.denied($q$update public.profiles set login_disabled = true where id = auth.uid()$q$),
  'A changed own login_disabled');
select pg_temp.assert(pg_temp.denied($q$update public.profiles set login_disabled = false where id = auth.uid()$q$),
  'A changed own login_disabled (false)');

-- ---------------------------------------------------------------- anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.assert(pg_temp.visible('select 1 from public.profiles') = 0, 'anon reads profiles');
select pg_temp.assert(pg_temp.visible('select 1 from public.conversations') = 0, 'anon reads conversations');
select pg_temp.assert(pg_temp.visible('select 1 from public.messages') = 0, 'anon reads messages');
select pg_temp.assert(pg_temp.visible('select 1 from public.media_items') = 0, 'anon reads media_items');
select pg_temp.assert(pg_temp.visible('select 1 from public.invites') = 0, 'anon reads invites');
select pg_temp.assert(pg_temp.denied($q$insert into public.messages (conversation_id, sender_id, body)
  values ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', 'anon')$q$), 'anon inserted a message');
select pg_temp.assert(pg_temp.visible('select 1 from public.invite_tokens') = 0, 'anon reads invite_tokens');
select pg_temp.assert(pg_temp.visible('select 1 from public.login_attempts') = 0, 'anon reads login_attempts');
select pg_temp.assert(pg_temp.denied($q$insert into public.invite_tokens (email, purpose, token_hash, expires_at)
  values ('evil@test.invalid', 'invite', 'y', now() + interval '1 day')$q$), 'anon inserted an invite_token');
select pg_temp.assert(pg_temp.denied($q$insert into public.login_attempts (email_hash) values ('y')$q$), 'anon inserted login_attempts');
select pg_temp.assert(pg_temp.denied($q$select public.revoke_user_sessions('00000000-0000-0000-0000-0000000000b1')$q$),
  'anon can execute revoke_user_sessions');
select pg_temp.assert(pg_temp.denied('select login_disabled from public.profiles'), 'anon can read login_disabled');
select pg_temp.assert(pg_temp.denied($q$update public.profiles set login_disabled = true$q$), 'anon changed login_disabled');

-- ---------------------------------------------------------------- mark_read only affects the recipient
reset role;
select pg_temp.assert(pg_temp.cnt('select 1 from public.messages where read_at is not null') = 0,
  'sender mark_read changed messages');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select public.mark_read('00000000-0000-0000-0000-00000000c0a1'); -- outsider: no effect
reset role;
select pg_temp.assert(pg_temp.cnt('select 1 from public.messages where read_at is not null') = 0,
  'outsider mark_read changed messages');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select public.mark_read('00000000-0000-0000-0000-00000000c0a1'); -- recipient
reset role;
select pg_temp.assert(pg_temp.cnt($q$select 1 from public.messages where read_at is not null
  and sender_id = '00000000-0000-0000-0000-0000000000a1'$q$) = 3, 'recipient mark_read did not mark all of A''s messages');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.visible('select 1 from public.messages') = 3, 'B cannot see the conversation');
reset role;

-- ---------------------------------------------------------------- delete for me (migration 11)
-- fixtures: one text and one media message from A (admin role)
insert into public.messages (id, conversation_id, sender_id, body, type) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', 'hide me', 'text'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', '', 'media');
insert into public.media_items (id, message_id, conversation_id, sender_id, kind, mime, size_bytes, mode) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-00000000c0a1',
   '00000000-0000-0000-0000-0000000000a1', 'image', 'image/jpeg', 1000, 'normal');

-- outsider C cannot hide a message of a conversation C is not in, and cannot read hides
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.hide_message('00000000-0000-0000-0000-0000000000f3');
    raise exception 'RLS TEST FAILED: outsider hid a message';
  exception when others then
    if sqlerrm like 'RLS TEST FAILED%' then raise; end if;
  end;
end $$;
select pg_temp.assert(pg_temp.visible('select 1 from public.message_hides') = 0, 'C reads message_hides');

-- B hides the text and the media message for self; direct writes are refused
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.visible('select 1 from public.messages where id = ''00000000-0000-0000-0000-0000000000f3''') = 1, 'B cannot see message before hiding');
select pg_temp.assert(pg_temp.denied($q$insert into public.message_hides (message_id, user_id)
  values ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000a1')$q$), 'B inserted a hide directly');
select pg_temp.assert(pg_temp.denied($q$delete from public.message_hides$q$), 'B deleted hides directly');
select public.hide_message('00000000-0000-0000-0000-0000000000f3');
select public.hide_message('00000000-0000-0000-0000-0000000000f3'); -- idempotent
select public.hide_message('00000000-0000-0000-0000-0000000000f4');
select pg_temp.assert(pg_temp.visible('select 1 from public.messages where id = ''00000000-0000-0000-0000-0000000000f3''') = 0, 'B still sees hidden text');
select pg_temp.assert(pg_temp.visible('select 1 from public.messages where id = ''00000000-0000-0000-0000-0000000000f4''') = 0, 'B still sees hidden media message');
select pg_temp.assert(pg_temp.visible('select 1 from public.media_items where id = ''00000000-0000-0000-0000-0000000000e2''') = 0, 'B still sees hidden media_items row');
select pg_temp.assert(pg_temp.visible('select 1 from public.media_items where id = ''00000000-0000-0000-0000-0000000000e1''') = 1, 'hiding one media hid another');
select pg_temp.assert(pg_temp.visible('select 1 from public.messages where id = ''00000000-0000-0000-0000-0000000000f1''') = 1, 'hiding hid an unrelated message');
select pg_temp.assert(pg_temp.visible('select 1 from public.message_hides') = 2, 'B should see exactly own 2 hides');

-- A (the partner) still sees everything and sees none of B's hides
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.visible('select 1 from public.messages where id in (''00000000-0000-0000-0000-0000000000f3'',''00000000-0000-0000-0000-0000000000f4'')') = 2,
  'A lost messages B hid');
select pg_temp.assert(pg_temp.visible('select 1 from public.media_items where id = ''00000000-0000-0000-0000-0000000000e2''') = 1, 'A lost media B hid');
select pg_temp.assert(pg_temp.visible('select 1 from public.message_hides') = 0, 'A reads B hides');
reset role;

-- delete for everyone (service role) removes the message and cascades the hides
delete from public.messages where id = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.assert(pg_temp.cnt('select 1 from public.message_hides where message_id = ''00000000-0000-0000-0000-0000000000f3''') = 0,
  'hides did not cascade on delete for everyone');

-- ---------------------------------------------------------------- member tools (migrations 26, 29, 33)
-- helper: true when running q raises any error whose message contains the given text
create function pg_temp.raises(q text, part text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when others then
  return sqlerrm like '%' || part || '%';
end $$;

-- fixtures: an old message from A (older than the 15 minute edit window), A's prefs row, two sessions for A and one for B
insert into public.messages (id, conversation_id, sender_id, body, type, created_at) values
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-0000000000a1', 'old text', 'text', now() - interval '20 minutes');
insert into public.user_prefs (user_id) values ('00000000-0000-0000-0000-0000000000a1') on conflict (user_id) do nothing;
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000000b1');

-- chat prefs: A mutes + stars the chat; an expired mute time counts as unmuted
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select public.set_chat_mute('00000000-0000-0000-0000-00000000c0a1', now() + interval '1 hour');
select public.set_chat_star('00000000-0000-0000-0000-00000000c0a1', true);
select pg_temp.assert(pg_temp.visible('select 1 from public.chat_prefs where muted_until is not null and starred') = 1, 'A mute/star was not saved');
select public.set_chat_mute('00000000-0000-0000-0000-00000000c0a1', now() - interval '1 minute');
select pg_temp.assert(pg_temp.visible('select 1 from public.chat_prefs where muted_until is null and starred') = 1, 'past mute time was not treated as unmute');
select pg_temp.assert(pg_temp.denied($q$insert into public.chat_prefs (user_id, conversation_id, starred) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000c0a1', true)$q$), 'A wrote chat_prefs directly');

-- B cannot read A's chat_prefs; B's own star does not touch A's row
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.visible('select 1 from public.chat_prefs') = 0, 'B reads A chat_prefs');
select public.set_chat_star('00000000-0000-0000-0000-00000000c0a1', false);
select pg_temp.assert(pg_temp.visible('select 1 from public.chat_prefs') = 1, 'B should see only its own chat_prefs row');
select pg_temp.assert(pg_temp.visible('select 1 from public.chat_prefs where user_id = ''00000000-0000-0000-0000-0000000000a1''') = 0, 'B sees A chat_prefs row');

-- outsider C cannot mute, star or clear a chat it is not in
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.raises($q$select public.set_chat_mute('00000000-0000-0000-0000-00000000c0a1', 'infinity')$q$, 'not allowed'), 'C muted a chat it is not in');
select pg_temp.assert(pg_temp.raises($q$select public.set_chat_star('00000000-0000-0000-0000-00000000c0a1', true)$q$, 'not allowed'), 'C starred a chat it is not in');
select pg_temp.assert(pg_temp.raises($q$select public.clear_chat('00000000-0000-0000-0000-00000000c0a1')$q$, 'not allowed'), 'C cleared a chat it is not in');

-- edit message: B cannot edit A's message; A cannot edit after 15 minutes; A can edit a fresh one; same text keeps edited_at
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.raises($q$select public.edit_message('00000000-0000-0000-0000-0000000000f1', 'hacked')$q$, 'not allowed'), 'B edited A message');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select pg_temp.assert(pg_temp.raises($q$select public.edit_message('00000000-0000-0000-0000-0000000000f5', 'too late')$q$, 'edit window closed'), 'edit after 15 minutes was allowed');
select public.edit_message('00000000-0000-0000-0000-0000000000f1', 'hello bob (edited)');
do $$
declare t1 timestamptz; t2 timestamptz;
begin
  select edited_at into t1 from public.messages where id = '00000000-0000-0000-0000-0000000000f1';
  if t1 is null then raise exception 'RLS TEST FAILED: edit did not set edited_at'; end if;
  t2 := public.edit_message('00000000-0000-0000-0000-0000000000f1', 'hello bob (edited)');
  if t2 is distinct from t1 then raise exception 'RLS TEST FAILED: unchanged edit moved edited_at'; end if;
end $$;
select pg_temp.assert(pg_temp.visible('select 1 from public.messages where id = ''00000000-0000-0000-0000-0000000000f1'' and body = ''hello bob (edited)''') = 1, 'edit was not saved');

-- sessions: A sees only its own two sessions and cannot revoke B's
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","session_id":"00000000-0000-0000-0000-0000000005a1"}', true);
select pg_temp.assert(pg_temp.cnt('select 1 from public.list_my_sessions()') = 2, 'A should list exactly its own 2 sessions');
select pg_temp.assert(pg_temp.cnt('select 1 from public.list_my_sessions() where id = ''00000000-0000-0000-0000-0000000005b1''') = 0, 'A lists B session');
select public.revoke_my_session('00000000-0000-0000-0000-0000000005b1'); -- silently deletes nothing
reset role;
select pg_temp.assert(pg_temp.cnt('select 1 from auth.sessions where id = ''00000000-0000-0000-0000-0000000005b1''') = 1, 'A revoked B session');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","session_id":"00000000-0000-0000-0000-0000000005a1"}', true);
select public.revoke_my_session('00000000-0000-0000-0000-0000000005a2');
select pg_temp.assert(pg_temp.cnt('select 1 from public.list_my_sessions()') = 1, 'A could not revoke its own other session');

-- user_prefs: B cannot update A's row (RLS filters it to 0 rows)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare n integer;
begin
  update public.user_prefs set theme = 'dark' where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS TEST FAILED: B updated A user_prefs'; end if;
end $$;
select pg_temp.assert(pg_temp.visible('select 1 from public.user_prefs where user_id = ''00000000-0000-0000-0000-0000000000a1''') = 0, 'B reads A user_prefs');

-- server-only tables and functions: a signed-in member gets nothing / is refused
select pg_temp.assert(pg_temp.visible('select 1 from public.storage_stats') = 0, 'authenticated reads storage_stats');
select pg_temp.assert(pg_temp.visible('select 1 from public.sms_chat_state') = 0, 'authenticated reads sms_chat_state');
select pg_temp.assert(pg_temp.denied('select * from public.push_candidates(30)'), 'authenticated ran push_candidates');
select pg_temp.assert(pg_temp.denied('select * from public.sms_candidates_v2(30)'), 'authenticated ran sms_candidates_v2');
select pg_temp.assert(pg_temp.denied('select * from public.sms_candidates_v3(30)'), 'authenticated ran sms_candidates_v3');
select pg_temp.assert(pg_temp.raises('select * from public.admin_member_health()', 'not allowed'), 'non-owner ran admin_member_health');
reset role;

do $$ begin raise notice 'ALL RLS TESTS PASSED'; end $$;
ROLLBACK;
