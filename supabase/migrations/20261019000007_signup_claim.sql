-- Security hardening, part B. Run AFTER part A (20261019000006) and AFTER the app version that sets the claim is deployed.
-- Closes the loophole where anyone who knows an invited email could create that account through Supabase's public
-- sign-up endpoint (the publishable key is public). An account can now only be created by the server, which first stores
-- a one-time secret on the invite row and passes it as user_metadata.claim. The secret is wiped right after use.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  claim text;
begin
  select * into inv from public.invites where lower(email) = lower(new.email);
  claim := coalesce(new.raw_user_meta_data ->> 'claim', '');
  if not found
     or inv.claim_secret is null
     or inv.claim_expires is null
     or inv.claim_expires < now()
     or claim <> inv.claim_secret then
    raise exception 'invite required';
  end if;
  insert into public.profiles (id, display_name, role, phone_enc)
  values (new.id, inv.display_name, inv.role, inv.phone_enc);
  insert into public.user_prefs (user_id) values (new.id);
  -- one use only: wipe the secret from the invite and from the stored user metadata
  update public.invites set claim_secret = null, claim_expires = null where id = inv.id;
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'claim' where id = new.id;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
