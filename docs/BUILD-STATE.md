# Link-C build state (resume file)

If a session is interrupted (usage limit, crash), tell Claude: "continue from docs/BUILD-STATE.md". Everything needed is here.
Working copy: C:\dev\link-c (never in OneDrive: node_modules). Mirror (no secrets, no qa/): `Link-C\code`.
Live stack: `docker compose` in C:\dev\link-c, app at http://localhost:3005. Supabase project `kjjyplcqobbojrjvlylb` (personal org), Backblaze bucket `link-c-bucket`.

## Decisions (owner, 2026-10-19)
- Login = EMAIL + PASSWORD (no more emailed links/codes). Admin sends a one-time invite link (24 h, single use). The person picks
  a display name + strong password on /invite/<token>, then signs in with email + password. Admin can reset a password (new link),
  disable or enable a person's login, or remove them.
- Password policy: at least 12 characters, zxcvbn score >= 3, no name/email inside it. 5 wrong tries lock the email for 15 minutes.
  People can change their password in Settings. (`src/lib/auth-policy.ts`, `src/lib/password.ts`)
- Design: the night-sky / frosted-glass / cyan-to-violet look from `Link-C\design\README.md` + `login-screen.html` for the WHOLE app
  (dark default, light variant, accent choices kept). Tokens live in `src/app/globals.css` (bg-app, bg-panel, .glass, .bg-grad, ...).
- Stickers: open-licensed Microsoft Fluent Emoji (MIT) as official packs, with credit. (Not the getstickerpack site: licence unknown.)
- Auto sign-out after 1 minute of inactivity (done, tested 18/18): `src/lib/idle.ts`, `src/components/IdleGuard.tsx`, middleware.
- Emergency path kept: `/auth/confirm` + `scripts/owner-login-link.mjs` (service-key holders only). QA helpers use it.

## Already done and tested
Core chat, media, snaps, calls, location, admin, SMS plumbing, emoji picker, reactions, stickers (own + official packs), avatars,
wallpapers, themes, setup wizard, save-media, typing indicator, idle logout, RLS tests, B2 storage, Docker hardening.
DB migrations 1-5 applied (5 = invite_tokens, login_attempts, profiles.login_disabled, revoke_user_sessions()).

## Status (2026-10-19, late)
Everything is built, tested by ~10 QA agents, and fixes are in. Migrations 1-9 applied to the live DB (6 = security hardening, 7 = sign-up claim lock,
8 = Clear chat, 9 = push). Added since round 3: light/dark one-tap toggle, Clear chat (per person), push notifications (admin text in Admin > Push,
VAPID keys in .env), Twilio-style SMS placeholders ({basicAuth}, {toDigits}), refresh/close prompt that ends the session, deep-link return after login,
focus-trapped dialogs, atomic login lockout, change-password keeps own session.
Owner decisions pending: SMS gateway for Sri Lanka (Twilio trial is not allowed there; use a local gateway or rely on push), hosting (existing VM or a
1 GB DigitalOcean droplet in Bangalore/Singapore).

## Remaining
1. Regression agent on the newest build (running), fix what it finds, rebuild if needed (`docker compose build && docker compose up -d`).
2. Cleanup (owner approved): delete `node_modules`, remove qa-* accounts + B2 orphans (`node --env-file=.env qa/b2-orphans.mjs --apply`), keep real owner,
   real member and the six official packs. Mirror code to `Link-C\code` (no .env, no qa/, no node_modules).
3. Owner: delete `.env` from OneDrive `Link-C\code`, deploy per docs/DEPLOY.md, rotate the Supabase secret key and Backblaze key after go-live,
   confirm Supabase "Allow new users to sign up" is OFF, nightly pg_dump backup (free Supabase has no restorable backups).
