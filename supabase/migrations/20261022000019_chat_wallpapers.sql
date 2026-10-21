-- Per-chat wallpapers: one optional override per (person, conversation). Only the person who set it can see it.
-- The custom picture is a separate encrypted user_assets row of kind 'chat_wallpaper' (the single default wallpaper keeps kind 'wallpaper').

alter table public.user_assets drop constraint if exists user_assets_kind_check;
alter table public.user_assets
  add constraint user_assets_kind_check check (kind in ('avatar', 'wallpaper', 'sticker', 'chat_wallpaper'));

create table if not exists public.chat_wallpapers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  kind text not null check (kind in ('none', 'preset', 'custom')),
  preset text check (preset is null or char_length(preset) <= 40),
  asset_id uuid references public.user_assets (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id),
  -- 'custom' needs a picture; other kinds may keep the picture so the person can switch back to it
  check (kind <> 'custom' or asset_id is not null)
);
alter table public.chat_wallpapers enable row level security;

-- The client may change only kind and preset. asset_id is written by the server (service role) when a picture is uploaded.
revoke all on public.chat_wallpapers from anon, authenticated;
grant select on public.chat_wallpapers to authenticated;
grant insert (user_id, conversation_id, kind, preset, updated_at) on public.chat_wallpapers to authenticated;
grant update (kind, preset, updated_at) on public.chat_wallpapers to authenticated;
grant delete on public.chat_wallpapers to authenticated;

drop policy if exists chat_wallpapers_select on public.chat_wallpapers;
drop policy if exists chat_wallpapers_insert on public.chat_wallpapers;
drop policy if exists chat_wallpapers_update on public.chat_wallpapers;
drop policy if exists chat_wallpapers_delete on public.chat_wallpapers;
create policy chat_wallpapers_select on public.chat_wallpapers for select to authenticated
  using (user_id = (select auth.uid()) and public.is_participant(conversation_id));
create policy chat_wallpapers_insert on public.chat_wallpapers for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_participant(conversation_id));
create policy chat_wallpapers_update on public.chat_wallpapers for update to authenticated
  using (user_id = (select auth.uid()) and public.is_participant(conversation_id))
  with check (user_id = (select auth.uid()) and public.is_participant(conversation_id));
create policy chat_wallpapers_delete on public.chat_wallpapers for delete to authenticated
  using (user_id = (select auth.uid()) and public.is_participant(conversation_id));

create index if not exists chat_wallpapers_conv_idx on public.chat_wallpapers (conversation_id);
