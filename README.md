# Link-C

Personal, invite-only secure chat PWA: 1:1 realtime chat, photo/video sharing (normal or one-time/timed snaps), stickers and reactions, calls via LiveKit, consent-based location, offline SMS alerts, owner admin panel. Next.js 16 + TypeScript, Supabase Cloud (Postgres with RLS, Auth, Realtime), Backblaze B2, Cloudflare Tunnel.

## Sign-in and design

- **Email + password** sign-in. No emailed links or codes. The owner creates one-time invite or reset links (24 hours, single use) and sends them privately.
- Strong passwords: 12+ characters, zxcvbn score 3 or more. 5 wrong tries lock an email for 15 minutes.
- The owner can disable or enable a person's login, reset a password, or remove a person. Idle users are signed out after 1 minute.
- The whole UI uses the night-sky, frosted-glass design (dark by default, light variant, accent choices).

- **Clean glass look (member settings, in progress):** each member picks their own look in Settings > Appearance (13 Apple accent colours or custom, five background styles, light/dark, glass strength and blur, switches for search bar, filter pills, read ticks and floating tab bar, plus a one-tap "Pure white glass" default). Developer notes are in [docs/BUILD-STATE.md](docs/BUILD-STATE.md).

## Quick start (local development)

1. `npm ci`
2. `cp .env.example .env.local` and fill in the Supabase URL, publishable key and secret key. Generate keys with `node scripts/gen-secrets.mjs`. Keep `STORAGE_DRIVER=local` and set `DATA_DIR=./data`.
3. `npm run dev` (http://localhost:3000)
4. Set the owner password: `node --env-file=.env.local scripts/owner-set-password-link.mjs you@example.com` (set `APP_URL=http://localhost:3000`), open the link, choose a password, then sign in at `/login`.
5. Worker (cleanup, SMS alerts): `npm run worker`.

Checks: `npm run lint`, `npm run typecheck`, `npm test`. RLS tests (use a test database, never production data): `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql`.

## Layout

- `src/` app code: `app/` pages and API routes, `components/`, `lib/` (crypto, storage, auth, look, offline, ...)
- `worker/` background process: snap/upload/location cleanup, disk check, storage stats, SMS alerts (`scripts/build-worker.mjs` bundles it to `dist/worker.mjs`)
- `supabase/migrations/` database schema and RLS; `supabase/tests/rls.sql` database security tests
- `scripts/` secrets generator, owner link scripts, worker build, emoji seed scripts; `scripts/qa/` regression scripts and helpers (need a test or local setup, see their first lines)
- `tests/` vitest unit tests
- `public/` static files, service worker, icons, offline page
- `Dockerfile`, `docker-compose.yml` containers: app (published on 127.0.0.1:3005 for the existing Cloudflare Tunnel), worker
- `docs/` guides, reports and design files (index: [docs/README.md](docs/README.md))
- `CLAUDE.md` project rules and status for Claude Code

## Docs

- [docs/DEPLOY.md](docs/DEPLOY.md): full deployment guide, first login, pre-launch checklist
- [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md): owner guide (invites, resets, disable login, stickers, Health and Storage pages, member tools)
- [docs/BUILD-STATE.md](docs/BUILD-STATE.md): decisions and build status
