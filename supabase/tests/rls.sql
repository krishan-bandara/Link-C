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

do $$ begin raise notice 'ALL RLS TESTS PASSED'; end $$;
ROLLBACK;
