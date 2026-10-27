-- HD photos: media_items.hd marks a photo sent in HD (longer side above 2048 px).
-- HD photos also get a lighter encrypted preview that the chat bubble shows; tapping the photo opens the full file.
alter table public.media_items add column if not exists hd boolean not null default false;

alter table public.media_keys
  add column if not exists preview_object_key text,
  add column if not exists preview_wrapped_key text,
  add column if not exists preview_size bigint;
