-- user_prefs.accent is checked against ^#[0-9a-f]{6}$ (lowercase only): the new default must match.
alter table public.user_prefs alter column accent set default '#007aff';
update public.user_prefs set accent = lower(accent) where accent <> lower(accent);
