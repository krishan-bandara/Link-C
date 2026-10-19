-- Round 2: profile (about, photo), per-person preferences, stickers, reactions.

-- ---------------------------------------------------------------- profile extras (visible to the chat partner)
alter table public.profiles
  add column if not exists about text check (about is null or char_length(about) <= 140),
  add column if not exists avatar_asset_id uuid;
grant select (about, avatar_asset_id) on public.profiles to authenticated;
grant update (about) on public.profiles to authenticated;

-- ---------------------------------------------------------------- encrypted small images (avatar, wallpaper, sticker)
create table if not exists public.user_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('avatar', 'wallpaper', 'sticker')),
  mime text not null,
  storage text not null check (storage in ('b2', 'local')),
  object_key text not null,
  wrapped_key text not null,
  plaintext_size bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists user_assets_owner_idx on public.user_assets (owner_id, kind);
alter table public.user_assets enable row level security;

-- ---------------------------------------------------------------- private preferences (only the owner can see them)
create table if not exists public.user_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  accent text not null default '#00a884' check (accent ~ '^#[0-9a-f]{6}$'),
  wallpaper_kind text not null default 'preset' check (wallpaper_kind in ('none', 'preset', 'custom')),
  wallpaper_preset text check (wallpaper_preset is null or char_length(wallpaper_preset) <= 40),
  wallpaper_asset_id uuid,
  wizard_done_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
grant select on public.user_prefs to authenticated;
grant insert (user_id) on public.user_prefs to authenticated;
grant update (theme, accent, wallpaper_kind, wallpaper_preset, wizard_done_at, updated_at) on public.user_prefs to authenticated;
create policy user_prefs_select on public.user_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy user_prefs_insert on public.user_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_prefs_update on public.user_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

insert into public.user_prefs (user_id) select id from public.profiles on conflict do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
begin
  select * into inv from public.invites where lower(email) = lower(new.email);
  if not found then
    raise exception 'invite required';
  end if;
  insert into public.profiles (id, display_name, role, phone_enc)
  values (new.id, inv.display_name, inv.role, inv.phone_enc);
  insert into public.user_prefs (user_id) values (new.id);
  return new;
end;
$$;

-- ---------------------------------------------------------------- stickers (all access goes through the app server)
create table if not exists public.sticker_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.sticker_packs enable row level security;

create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid references public.sticker_packs (id) on delete cascade, -- null = a member's own sticker
  creator_id uuid not null references public.profiles (id) on delete cascade,
  asset_id uuid not null references public.user_assets (id) on delete cascade,
  emoji text check (emoji is null or char_length(emoji) <= 16),
  created_at timestamptz not null default now()
);
create index if not exists stickers_pack_idx on public.stickers (pack_id);
alter table public.stickers enable row level security;

create table if not exists public.user_stickers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sticker_id uuid not null references public.stickers (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, sticker_id)
);
alter table public.user_stickers enable row level security;

-- ---------------------------------------------------------------- messages: sticker type
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check check (type in ('text', 'media', 'system', 'sticker'));
alter table public.messages add column if not exists sticker_id uuid references public.stickers (id) on delete set null;

-- ---------------------------------------------------------------- reactions (one emoji per person per message)
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reactions enable row level security;
grant select, delete on public.message_reactions to authenticated;
grant insert (message_id, user_id, emoji) on public.message_reactions to authenticated;
grant update (emoji) on public.message_reactions to authenticated;

create policy reactions_select on public.message_reactions for select to authenticated
using (exists (select 1 from public.messages m where m.id = message_id and public.is_participant(m.conversation_id)));
create policy reactions_insert on public.message_reactions for insert to authenticated
with check (user_id = (select auth.uid())
  and exists (select 1 from public.messages m where m.id = message_id and public.is_participant(m.conversation_id)));
create policy reactions_update on public.message_reactions for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reactions_delete on public.message_reactions for delete to authenticated
using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.message_reactions;
alter table public.message_reactions replica identity full;
