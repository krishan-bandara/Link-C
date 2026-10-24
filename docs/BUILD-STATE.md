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

## Clean glass look (2026-10-25, in progress)
Per-member appearance in Settings > Appearance, layered on top of the night-sky design above. Not yet confirmed deployed or tested on phones; design references are outside the repo (owner's OneDrive `Link-C\designing`).
- Options: 13 Apple system accent colours + custom colour; backgrounds Pure white glass (default), Soft pale, Vivid wallpaper, Two-tone, Plain; light/dark; glass strength and blur sliders; switches for search bar, filter pills (All, Unread, Online), read ticks in the chat list preview, floating glass tab bar; one-tap "Pure white glass" preset.
- Storage: `user_prefs.look` (JSON text), migration `supabase/migrations/20261025000024_clean_glass_look.sql`, plus cookie `lc-look` so the look applies before first paint. The migration must be applied to the live DB before the column is used.
- Code: `src/lib/look.ts` (shape, defaults, parsing), `src/lib/useLook.ts` (client hook), `src/app/look*.css` (styles).
- Contract between code and CSS, set on `<html>`: `data-bg` (background style), `data-tabs` (floating tab bar on or off), and CSS variables `--lg-a` (glass see-through amount, 0.15 to 0.8) and `--lg-b` (glass blur in px). Style new UI with these, do not hard-code colours. Unknown or invalid stored values must fall back to the Pure white glass defaults.

## Member tools (2026-10-25, in progress)
Eight features being built in parallel by separate agents. Not yet confirmed deployed or tested on phones. Data layer: `supabase/migrations/20261025000026_member_tools.sql` (must be applied to the live DB first). Shared client helper: `src/lib/chatprefs.ts`. All writes from the browser go through security definer RPCs that check the caller; the new tables have RLS on.
1. Mute and Do-not-disturb: per chat, mute for 8 hours, 1 week or until unmuted (`chat_prefs.muted_until`, RPC `set_chat_mute`; null = unmuted, `infinity` = until unmuted). Per member quiet hours in Colombo time (`user_prefs.dnd_on`, `dnd_from`, `dnd_to`, default 22:00 to 07:00, HH:MM text). A muted chat or quiet hours silence push, sounds and the offline SMS for that member. Unread badges still show.
2. Star a chat (`chat_prefs.starred`, RPC `set_chat_star`): starred chats are pinned at the top of the chat list, and a "Favourites" filter pill shows only them.
3. Edit a sent message (RPC `edit_message`, column `messages.edited_at`): own text messages only, within 15 minutes of sending, 1 to 4000 characters. The message shows "edited". Edits overwrite the old text (no history kept).
4. Signed-in devices in Settings (RPCs `list_my_sessions`, `revoke_my_session`, `revoke_other_sessions`): sign out one device or all other devices. Limit: a signed-out device can stay signed in until its short access pass expires.
5. Log out button at the bottom of Settings with a confirmation, also in the account menu.
6. Offline mode: the chat list and the last messages are cached and readable offline; text messages written offline are queued and sent when the connection returns. All offline data is wiped on logout. Privacy note: while logged in, messages are stored on the device.
7. Admin > Health, member activity (RPC `admin_member_health`, owner only): last seen, last login, active sessions. Amber after 3 days without activity, red after 7.
8. Admin > Storage (table `storage_stats`, written by the worker, no direct client access): server disk free and Backblaze usage. Editable thresholds in `app_settings`: `disk_free_alert_pct` (default 15), `b2_budget_gb` (default 10), `b2_alert_pct` (default 80). A red banner in Admin and a push to the owner when nearly full (`storage_stats.alert_level` ok/warn/critical, `alert_sent_at` limits repeats). Backblaze figures are an estimate (sum of plaintext sizes).
Still to do: apply the migration, run RLS tests for the new tables and RPCs, test on real phones, then deploy.

## Remaining
1. Regression agent on the newest build (running), fix what it finds, rebuild if needed (`docker compose build && docker compose up -d`).
2. Cleanup (owner approved): delete `node_modules`, remove qa-* accounts + B2 orphans (`node --env-file=.env qa/b2-orphans.mjs --apply`), keep real owner,
   real member and the six official packs. Mirror code to `Link-C\code` (no .env, no qa/, no node_modules).
3. Owner: delete `.env` from OneDrive `Link-C\code`, deploy per docs/DEPLOY.md, rotate the Supabase secret key and Backblaze key after go-live,
   confirm Supabase "Allow new users to sign up" is OFF, nightly pg_dump backup (free Supabase has no restorable backups).
