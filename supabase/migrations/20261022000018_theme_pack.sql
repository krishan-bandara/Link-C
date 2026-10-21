-- Theme packs (Love, Cyber Neon, Aurora, Sakura, Midnight). The light/dark mode stays in user_prefs.theme.
alter table public.user_prefs add column if not exists pack text check (pack is null or pack in ('love', 'cyber', 'aurora', 'sakura', 'amoled'));
grant update (pack) on public.user_prefs to authenticated;
