-- Password login: one-time invite / reset links, login lockout, "disable login" support.
create table if not exists public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('invite', 'reset')),
  token_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists invite_tokens_email_idx on public.invite_tokens (lower(email));
alter table public.invite_tokens enable row level security;

create table if not exists public.login_attempts (
  email_hash text primary key,
  fails int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.login_attempts enable row level security;

alter table public.profiles add column if not exists login_disabled boolean not null default false;

-- Ends every session of a user at once (used when the owner disables someone's login).
create or replace function public.revoke_user_sessions(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user;
$$;
revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

alter table public.user_prefs alter column accent set default '#6ee7f9';
update public.user_prefs set accent = '#6ee7f9' where accent = '#00a884';
