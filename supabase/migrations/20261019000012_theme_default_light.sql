-- New accounts default to the light theme. Existing rows are left unchanged on purpose.
-- (The theme column lives on public.user_prefs, not profiles.)
alter table public.user_prefs alter column theme set default 'light';
