-- Voice notes: media_items.kind may now be 'audio' (in addition to 'image' and 'video').
-- Idempotent. The original inline check in migration 1 is auto-named media_items_kind_check.
-- No other table, function, policy or RPC restricts kind or mime (upload_sessions.mime is free text).
alter table public.media_items drop constraint if exists media_items_kind_check;
alter table public.media_items
  add constraint media_items_kind_check check (kind in ('image', 'video', 'audio'));
