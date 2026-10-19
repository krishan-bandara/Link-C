-- The profile row references auth.users, so the trigger must run AFTER the user row exists.
-- Raising inside an AFTER trigger still rolls the insert back, so uninvited sign-ups stay blocked.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
