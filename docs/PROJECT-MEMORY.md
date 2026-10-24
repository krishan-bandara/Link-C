# Link-C project memory (history, features, gotchas)

Moved into git on 2026-10-25 so any session started in this repo can see it. Short rules and decisions: `CLAUDE.md` at the repo root. Technical state: `BUILD-STATE.md`. Deploy: `DEPLOY.md`.
Private operating details (server address, SSH key file name, owner emails, database project id) are in the full memory copy `claude-memory/` next to this file (keep the repo private). No passwords or key values are stored anywhere in the repo.

## Hosting history
- 2026-10-18: first live on the owner's home Linux VM behind a Cloudflare tunnel.
- 2026-10-22: moved to Oracle Cloud Always Free (Pay As You Go account, Always Free resources only, Mumbai): VM.Standard.A1.Flex ARM, 1 OCPU / 6 GB (free allowance is 2 OCPU / 12 GB), Ubuntu 24.04 Minimal aarch64. Reason: the home VM measured about 5 Mbit/s up and 350 ms ping, so uploads and media were very slow.
- 1 CPU server: `docker-compose.yml` CPU limits come from `APP_CPUS` and `WORKER_CPUS` in the server `.env` (use APP_CPUS=1, WORKER_CPUS=0.5).
- Cloudflare: new tunnel for the Oracle server, hostname link-c.innoforge.dpdns.org -> http://localhost:3005. The older shared tunnel (n8n, ssh) keeps its token.

## Feature history
- 2026-10-18/19: core chat, replies, reactions, emoji and 96 Fluent Emoji sticker packs (MIT), photos/video, snaps (view once / timed), calls (LiveKit), consent-based location, admin (members, invites, SMS, push, stickers, audit), push notifications, SMS alerts (Notify.lk), light/dark toggle, per-person Clear chat, delete for me / for everyone, idle logout, privacy shield, email + password login with invite links. About 15 security agents reviewed it: 0 critical, 1 high (image bomb) fixed.
- 2026-10-20..22 (migrations 12-19): camera/gallery menu, keyboard-safe chat height, reply (hold + swipe), client photo shrink, SMS invite link, offline SMS escalation, resumable parallel uploads, theme packs (Love, Cyber, Aurora, Sakura, Midnight), avatar viewer, per-chat wallpapers. A Matrix-rain login was built and reverted (owner found it ugly): do not re-add unless asked.
- 2026-10-22 SMS rewrite (migrations 20, 21): phone numbers plain E.164 (owner decision); schedule 45 s offline, 10 min, then every 19 min; admin "Recent SMS attempts" log; 200-with-error replies count as failures.
- 2026-10-23 (migrations 22, 23): voice notes, "Video" attach, "..." menu on every media bubble, admin SMS tab redesign, phone-width fixes, privacy shield also on blur. SMS daily limit is ONE shared pool (default 75).
- 2026-10-24: animated sticker packs (Google Noto Emoji Animation, CC BY 4.0, seeded with `scripts/seed-animated-emoji.mjs` against the local app; stickers keep animation, 256 px, max 300 frames / 2 MB; very long animations are rejected). Emoji picker: the emoji button hides the phone keyboard, no search autofocus on touch, panel height follows the visible screen.
- 2026-10-25 clean glass look (migrations 24, 25): see CLAUDE.md. Files: `src/lib/look.ts`, `useLook.ts`, `LookProvider.tsx`, `src/app/look*.css` (look-perf.css loads last and removes per-item blur for phone speed), `LookPicker.tsx`, `AccentPicker.tsx`. Login goes light under the white look, dark kept for dark themes/packs.
- 2026-10-25 member tools (migrations 26, 27, 29, all applied to the live database):
  - Mute a chat (8 h / 1 week / until unmuted) and star a chat (= pinned + Favourites pill) through RPCs `set_chat_mute` / `set_chat_star` (table `chat_prefs`); Do-not-disturb hours (`user_prefs.dnd_*`, Colombo time); shared rules in `src/lib/chatprefs.ts`; the worker skips muted chats and quiet hours for SMS and push (`sms_candidates_v2` / `push_candidates` skip muted chats; DND checked in JS).
  - Edit own text message within 15 minutes (RPC `edit_message`, `messages.edited_at`, "edited" label).
  - Settings > Signed-in devices (RPCs `list_my_sessions`, `revoke_my_session`, `revoke_other_sessions`, which fail closed if the access token has no `session_id`) and a red Log out button with confirmation (also in the account menu; fires window event `lc-logout`).
  - Offline mode: service worker serves `/offline.html` + `offline.js` (read-only viewer, 60 s idle lock); chat list and last 100 messages cached in IndexedDB; text-only send queue with duplicate safety; everything wiped on logout / sign-out / user change. Privacy trade-off: chat text sits unencrypted on the device while signed in.
  - Admin > Health (`admin_member_health`, amber after 3 days, red after 7) and Admin > Storage (worker `storage-stats.ts` every 10 min, table `storage_stats`, thresholds `disk_free_alert_pct` 15 / `b2_budget_gb` 10 / `b2_alert_pct` 80 in `app_settings`, red banner + push to the owner).

## Gotchas learned
- `data/` must be `chown -R 1000:1000` on the server (uploads, media, videos all fail with EACCES otherwise).
- The browser may only write granted columns. `upsert` on a table with column grants is refused once the row exists (chat wallpapers bug, fixed with update-then-insert). Use RPCs for new writes.
- `user_prefs.accent` check requires lowercase hex; offering an uppercase colour makes every save fail and would also break creating new accounts.
- Vitest cannot import `.tsx`; put pure logic in `.ts` files with tests.
- Supabase MCP `execute_sql` returns only the LAST statement's result when several are sent.
- Headless Edge cannot render narrower than about 500 px: use a 420 px iframe or force the body width for phone screenshots, and disable CSS animations or shots look faded. Never run two `next build` at once.
- Revoked sessions: deleting a session stops refresh, but an already issued access token keeps working for PostgREST/Realtime until it expires: set the access-token expiry to 300 s.
- Agents sometimes stop early without a report: check the files they own.

## Parked / not built
Screenshot protection for snaps (needs a native Android/iPhone wrapper; the web notice only fires on PrintScreen, Cmd+Shift+3-5, Ctrl+P, blur), group chats, Snaps filter pill, disappearing messages, link previews, GIF search, reduced motion for animated stickers, video snaps strictly once, encrypting temp files, optional `messages.client_id` for exact duplicate-proof offline sends.
