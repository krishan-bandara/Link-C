-- Clean glass look: one small JSON text per member (background style, glass strength, blur, search/pills/ticks/tab switches).
alter table public.user_prefs add column if not exists look text check (look is null or length(look) <= 200);
grant update (look) on public.user_prefs to authenticated;

-- New default accent: Apple blue. Members still on the old default cyan move to it, other choices stay.
alter table public.user_prefs alter column accent set default '#007AFF';
update public.user_prefs set accent = '#007AFF' where accent = '#6ee7f9';
