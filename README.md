# Link-C

A small, private chat app for people who actually know each other.

Link-C works like WhatsApp, but it is invite-only and built for a handful of people (one to fewer than fifty). You can't sign up on your own. The owner sends you a one-time link, you pick a name and a password, and you're in. It runs in the browser and installs on a phone like an app, on a PC, a Samsung or an iPhone.

## What you can do in it

- **Chat one to one** in real time, with replies, reactions, stickers and emoji. You can edit a message for 15 minutes after sending it, and delete it for yourself or for everyone.
- **Share photos, videos and voice notes.** Photos can go out in HD. Pictures and videos can also be sent as a *snap*: the other person sees it once (or for a short time) and then it is gone.
- **Get a text message if you miss something.** If you are offline and a message is waiting, the app can send a short, plain SMS (up to three per chat, then it stops until you open the app again).
- **Share your location**, but only when the other person agrees.
- **Make it yours.** In Settings > Appearance you pick an accent colour, a background, light or dark, and how glassy it looks. You can also mute a chat, star it, or turn on Do-not-disturb hours.
- **Keep reading with no signal.** Recent chats are saved on your device, so you can read them offline. They are wiped when you log out.
- **See which devices are signed in** and log any of them out.

## Privacy and safety, in plain words

- Everything travels over HTTPS, and files are encrypted on the server with their own key (this is not end-to-end encryption, so the owner's server can technically read them).
- Passwords need 12+ characters and have to be hard to guess. Five wrong tries lock the account for 15 minutes.
- You are signed out automatically after one minute of being idle.
- Snaps are kept only as temporary files on the server's disk and are deleted after they are viewed or after 24 hours.
- Screenshot detection is best effort. A web app cannot truly block screenshots, so don't rely on it.
- The database enforces who may see what (row level security), and there are tests for that.

## Try it on your own computer

You'll need Node.js and a free Supabase project.

1. `npm ci`
2. Copy `.env.example` to `.env.local` and fill in the Supabase address and keys. `node scripts/gen-secrets.mjs` makes the secret values for you. Keep `STORAGE_DRIVER=local` and `DATA_DIR=./data`.
3. `npm run dev`, then open http://localhost:3000
4. Make the first owner login: `node --env-file=.env.local scripts/owner-set-password-link.mjs you@example.com` (with `APP_URL=http://localhost:3000`). Open the link it prints, choose a password, then sign in at `/login`.
5. In a second terminal, run the background worker with `npm run worker`. It cleans up old snaps and uploads and sends the SMS alerts.

Before you share changes, run `npm run lint`, `npm run typecheck` and `npm test`. The database security tests (`supabase/tests/rls.sql`) should only ever be run against a test database, never against real data.

## How it is built

Next.js 16 and TypeScript for the app, Supabase for the database, sign-in and live updates, Backblaze B2 for normal photos and videos, and a small Node worker for background jobs. In production it runs in two Docker containers (app and worker) on a free Oracle Cloud server, behind a Cloudflare Tunnel.

## Where things are

- `src/` the app itself: `app/` (pages and API), `components/`, `lib/` (encryption, storage, sign-in, looks, offline mode)
- `worker/` the background process
- `supabase/migrations/` the database setup, and `supabase/tests/` its security tests
- `scripts/` helper scripts (secrets, owner links, deploy), and `scripts/qa/` for regression checks
- `tests/` unit tests
- `public/` icons, the service worker and the offline page
- `docs/` the guides, reports and design files (start at [docs/README.md](docs/README.md))
- `CLAUDE.md` the working notes for Claude Code

## Guides

- [Deploying it](docs/DEPLOY.md): putting it on a server, first login, and a checklist before going live
- [Owner guide](docs/ADMIN-GUIDE.md): invites, password resets, turning logins off, stickers, the Health and Storage pages
- [Build state](docs/BUILD-STATE.md): what has been decided and what is done

This is a personal project, not a company product.
