# Link-C - project memory for Claude

Personal project of the owner (NOT Softlogic work). Read this first in every session, then `docs/PROJECT-MEMORY.md` (history, features, gotchas) and `docs/BUILD-STATE.md`.
## Memory protocol (the repo is the single source of truth)
1. At the start of every session read `docs/claude-memory/MEMORY.md` (the index) and the memory files it lists in `docs/claude-memory/`. They hold the history, hosting details, owner preferences and working style. They include private operating details (server address, SSH key file name, owner emails, database project id; NO passwords or key values), so KEEP THIS GITHUB REPOSITORY PRIVATE.
2. When something worth remembering happens, SAVE IT HERE: edit or add a file in `docs/claude-memory/` (same format as the existing files: frontmatter + body, one fact per file) and add or update its one-line pointer in `docs/claude-memory/MEMORY.md`. Do not keep memory only in the Claude folder on the computer. Short rules and status also go in this file; long history goes in `docs/PROJECT-MEMORY.md`.
3. Optional mirror: Claude Code's own auto-memory folder for this path (`~/.claude/projects/D--My-Docs-my-git-reppo-Link-C/memory`) may be refreshed by copying `docs/claude-memory/*.md` into it. The repo copy wins if they differ.
4. Remind the owner to commit and push memory changes (they push manually).

## What it is
Invite-only secure chat web app (PWA), WhatsApp-style, for 1 to under 50 people. Works on PC, Samsung and iPhone. Live at https://link-c.innoforge.dpdns.org.

## Owner
Beginner developer building entirely with Claude Code. Wants production-grade, secure, cost-effective ($0-2/month). Explain in plain words, never skip security, ask a few questions before big decisions ("grill me"). Likes big tasks split across many parallel agents. Pushes git manually (the shell has no GitHub key); database migrations are applied by Claude through the Supabase MCP.

## Where things live
- **Everything is in this repo** (`D:\My_Docs\my-git-reppo\Link-C`, branch main): code, database migrations, scripts, tests, plans, designs, reports and the Claude memory. START every Claude Code session from this folder (`cd D:\My_Docs\my-git-reppo\Link-C`, then `claude`): it loads this file and the memory for this path. The old OneDrive folder (now at `...\Digital_InnoDocs\personal\git\Link-C`) is archived and NOT needed for any work; old copies (`C:\dev\link-c`, OneDrive `code`) are dead.
- **Docs index:** `docs/README.md`. Planning: `docs/planning/` (original plan, planning guide). Design files: `docs/design/` (glass look options, original login). Reports: `docs/reports/` (architecture, security review, media flow). Full Claude memory copy: `docs/claude-memory/`.
- **Scripts:** `scripts/` (secrets, owner links, worker build, emoji seeds) and `scripts/qa/` (regression scripts + helpers). Database security tests: `supabase/tests/rls.sql`. Local-only, git-ignored: `.cache/`, `data/`, `.env*`.
- **Server:** Oracle Cloud Always Free ARM VM (Mumbai), repo at `~/_work/Link-C`, plain `.env` in that folder (never read or print env files). Deploy: `git pull`, then `sudo docker compose up -d --build --force-recreate` (rebuilds app AND worker). `data/` must be owned by 1000:1000 (`sudo chown -R 1000:1000 data`) or uploads and media fail with EACCES.
- **Database:** the owner's personal free Supabase cloud project named `link-c` (find it with the Supabase MCP `list_projects`). Never touch Softlogic/work Supabase projects. Migrations: `supabase/migrations` (apply with `apply_migration`; if it says "Invalid or expired requestState" just retry).
- **Network:** Cloudflare tunnel to http://localhost:3005. Do not rotate the token of the older shared tunnel (n8n uses it).
- **Storage:** Backblaze B2 private bucket for normal media; snaps only as encrypted temp files on the server disk.

## Decisions (confirmed by the owner; newest wins)
- Login: email + password, invite-only (one-time invite link, person picks name + password). 12+ chars, zxcvbn >= 3, 5 wrong tries lock 15 min. Auto sign-out after 1 minute idle. Public sign-up OFF.
- Stack: Next.js 16 + TypeScript + Tailwind 4 (PWA), Supabase cloud (Postgres + RLS, Auth, Realtime), Node worker, Docker Compose project `linkc` (app + worker only, separate from n8n, no Docker socket).
- Encryption: HTTPS + server-side encryption (not E2E). Per-file AES-256-GCM, key wrapped by MASTER_KEY.
- Snaps/view-once: temp files on the server disk only; image deleted when streamed once, video playable up to 10 min after opening, unopened after 24 h. Screenshot detection is best effort only (say so honestly).
- SMS (Notify.lk, Admin > SMS): disguised owner-editable text, no app name or link; first alert when a person is offline 45 s with an unread message, then after 10 min, then every 19 min until they open the app; ONE shared daily pool for all members (default 75, Colombo midnight reset), shared monthly cap; muted chats and Do-not-disturb silence SMS and push.
- Look: default "Pure white glass" (from the owner's design pick); per-member Settings > Appearance: 13 Apple accent colours (lowercase hex only: DB check `^#[0-9a-f]{6}$`) + custom, backgrounds white/pale/vivid/duo/mono, light/dark, glass strength + blur, switches for search/filter pills/read ticks/floating tab bar. Contract in `src/lib/look.ts`; styles `src/app/look*.css`.
- Parked by owner: screenshot protection (needs a native wrapper), group chats not built (conversations are strictly 1 to 1).

## Status (2026-10-25)
Everything in `docs/PROJECT-MEMORY.md` is built. The newest batches (animated stickers, clean glass look, member tools: mute/star/Do-not-disturb, edit message, devices + Log out, offline mode, Admin Health + Storage) are tested (30 test files / 299 tests pass, `next build` OK) but were NEVER tried on a real phone; check git log / ask the owner whether they are pushed and deployed. Migrations 24 to 29 are applied to the live database.

## Open items
1. Owner: push, deploy (worker too), then test on a real phone and report problems.
2. Supabase dashboard: access-token expiry 300 s, leaked-password protection, sign-up OFF.
3. Nightly pg_dump backup (free Supabase has no restore); rotate Supabase secret key and Backblaze key.
4. Verify Google's Noto animated emoji licence (CC BY 4.0) on the official site; add a licence link on the credits page.
5. Ideas not built: group chats, Snaps filter pill, reduced motion for animated stickers, disappearing messages, link previews, GIF search, native wrapper, video snaps strictly once, encrypting temp files.

## Rules for working on this project
- Never put secrets in code or git; `.env.example` only. Never read or print env files. Keep private details out of committed files.
- RLS on every table, with tests proving users cannot read each other's data. Browser writes use column grants or security definer RPCs. NEVER use supabase `upsert` on tables with column grants (refused: chat_wallpapers bug): use update-then-insert or an RPC.
- Keep Link-C isolated from n8n (own network, volumes, secrets).
- Keep the storage and SMS providers behind adapters.
- Large UI work: define shared contracts first, one owner per file, run `npx tsc --noEmit`, `npx vitest run` and `npx next build` after (never two builds at once).
- Cost, B2 pricing and gateway details in the docs are estimates; verify before relying on them.
