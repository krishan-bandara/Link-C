-- Fix: media_items.hd (added in migration 30) was never granted to browsers. The chat history query selects it,
-- so with column-level grants the whole query was refused and old photos/videos/voice notes never loaded.
grant select (hd) on public.media_items to authenticated;
