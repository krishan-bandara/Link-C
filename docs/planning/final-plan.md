# Link-C - Final Plan

Personal project. Invite-only secure chat web app (PWA), WhatsApp-style, self-hosted on your own Linux VM. Give this file to Claude Code with the build prompt in section 14.

---

## 1. Summary

| Item | Decision |
|---|---|
| Name | Link-C |
| Users | Owner (admin) + invited members; starts with 1 member; max under 50 |
| Platforms | One responsive web app, installable as a PWA; adapts to PC, Samsung and iPhone screens |
| Builder | You (beginner) with Claude Code |
| Hosting | Your local Linux VM (Docker), Cloudflare Tunnel + free domain |
| Encryption | HTTPS everywhere; server-side encryption, server holds keys (not end-to-end) |
| Login | Email magic link only (invite-only) |
| History | Normal messages kept; snaps deleted after viewing |

### v1 features
1. Invite-only sign-up (owner invites; public sign-up disabled)
2. Magic-link login (with 6-digit code fallback)
3. 1:1 realtime text chat
4. Photo/video sharing: normal (kept in Backblaze B2) or one-time / timed snap (never in B2)
5. Snap timer 1-10 seconds or no limit; auto-closes; deleted after viewing
6. Read receipts, typing indicator
7. Voice and video calls (LiveKit Cloud)
8. Screenshot alert (best effort only)
9. Owner "Request location" button in chat (consent-based)
10. Offline SMS alert, fully configured in the admin panel
11. Admin panel (owner only)

Out of scope for v1: group chats, end-to-end encryption, native apps, public sign-up.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS, PWA |
| Backend | Next.js server code (route handlers / server actions) + a small background worker |
| Database / auth / realtime | Self-hosted Supabase in Docker (Postgres with Row Level Security, Auth, Realtime) |
| Normal media | Encrypted by the server, stored in Backblaze B2 (private bucket) |
| Snap media | Encrypted temporary files on the VM disk only |
| Calls | LiveKit Cloud free tier |
| Public access | Cloudflare Tunnel (outbound only) + Cloudflare Access for the admin panel |
| Email (magic links) | Free SMTP (Brevo or Resend) |
| SMS | Generic gateway behind an adapter, configured in the admin panel |
| Monitoring | Sentry free tier + container logs |
| CI | GitHub Actions: lint, type-check, tests, dependency and secret scan |

---

## 3. Architecture

```
Browser / PWA (PC, Android, iPhone)
   | HTTPS
Cloudflare (DNS, WAF, rate limits) -- Access login on /admin
   | Cloudflare Tunnel (outbound from your VM, no open ports)
Your Linux VM (Docker Compose project "linkc", own network; n8n stays separate)
   - Next.js app + worker
   - Supabase (Postgres + RLS, Auth, Realtime)
   - /data/snaps  (encrypted temporary snap files)
   |                         |
Backblaze B2              LiveKit Cloud     SMS gateway     SMTP
(encrypted normal media    (calls)           (alerts)        (magic links)
 and DB backups)
```

### Data model
- `profiles` (id, display_name, role owner|member, phone_e164 encrypted, sms_alerts_enabled, phone_verified_at)
- `invites` (id, email, phone, token_hash, expires_at, used_at)
- `conversations` (id, user_a, user_b)
- `messages` (id, conversation_id, sender_id, body, type, created_at, delivered_at, read_at)
- `media_items` (id, message_id, mode normal|once|timed, timer_seconds, b2_object_key nullable, local_path nullable, wrapped_key, viewed_at, deleted_at, expires_at)
- `view_events` (id, media_id, viewer_id, viewed_at, screenshot_flag)
- `location_shares` (id, conversation_id, sharer_id, requested_by, status, expires_at)
- `sms_settings` (single row: enabled, provider, api_url, sender_id, credentials_encrypted, template_text, offline_after_seconds, daily_cap, monthly_cap, quiet_hours)
- `sms_log` (id, user_id, sent_at, provider_status, offline_period_id)
- `presence_state` (user_id, last_seen_at, last_sms_at, sms_sent_this_period)
- `audit_log` (id, actor_id, action, target, at) - never stores message content or secret values

---

## 4. Media handling

| Media | Stored | Lifetime |
|---|---|---|
| Normal photo/video | Encrypted, then Backblaze B2 | Until the user deletes it (deleted permanently, not just to trash) |
| One-time / timed snap | Encrypted temp file on VM only, **never B2** | Deleted right after first view; unopened snaps deleted after 24 hours |

**Normal media flow**
1. Upload: server checks type and size, strips EXIF (GPS, camera info), encrypts (AES-256-GCM, unique key per file, wrapped by a master key).
2. Encrypted file goes to a private B2 bucket; the database stores only the B2 object key.
3. To view, the server downloads, decrypts, and streams it to the authorised member over a short-lived link on your own domain. No B2 link is ever shared.
4. Message deleted: B2 object deleted permanently (all versions).

**Snap flow**
1. Upload to `/data/snaps` (encrypted); row marked `once` or `timed`.
2. Recipient opens once: server atomically marks it viewed, streams it via a link valid ~30 s, then deletes the file.
3. Cleanup job every minute removes viewed leftovers and anything older than 24 hours.
4. Snap files are excluded from backups and caches.

**Limits**
- Cloudflare is only a pass-through (phone -> Cloudflare -> tunnel -> your VM -> B2); it stores nothing. Its free plan rejects any single request over 100 MB.
- **Chunked, resumable uploads:** the browser splits any file into 8 MB chunks, each sent as its own request (so none nears 100 MB). The server stores chunks in an encrypted temp folder under an upload ID, checks each chunk's size and order, and assembles the file when all arrive. A dropped connection resumes from the last good chunk.
- Limits (editable in the admin panel): photo 10 MB, video 300 MB, max 2 uploads in progress per member, temp upload space capped at 3 GB, unfinished uploads deleted after 1 hour.
- The server verifies the real file type and total size after assembly, then continues with EXIF strip, encryption and B2 upload as in the flows above.
- Keep a small encrypted read cache of recent normal media (max 2 GB, auto-expiring) because B2 is across the internet and slower than local disk.
- A recipient can always screenshot or film a snap. "Deleted" means gone from your server.

---

## 5. Backblaze B2 rules

- Create a **dedicated Backblaze account** with a unique strong password and 2-step verification (authenticator app); use it for nothing else.
- Make **one private bucket** (never public) and one **application key limited to that bucket only**, not the master key. Store the key as a server secret, never in git, logs or the browser.
- Turn on **bucket lifecycle "keep only the last version"** so deleted files are really removed (B2 keeps old versions by default).
- Use B2 server-side encryption in addition to our own file encryption, and set a **monthly spending cap** with billing alerts.
- If the application key leaks, delete it in the B2 console and create a new one; files stay unreadable because they are encrypted with our own master key.
- Keep the storage code behind a small adapter so the provider can be swapped later.

---

## 6. Location feature (consent-based)

- Owner sees a "Request location" button in each chat (owner account only).
- The member gets a prompt: accept for 15 min, 1 hr or 8 hr, or decline. A visible banner shows while sharing, with a Stop button.
- Location is kept only for the sharing window, then deleted; every share is logged.
- Silent or background tracking is not built: browsers can't do it, and it is illegal without consent.

---

## 7. Offline SMS alert

| Item | Decision |
|---|---|
| Trigger | One SMS per offline period: first unread message while the member is offline; resets after they open the app |
| Offline definition | No active session for 2 minutes (editable) |
| Text | System-style disguised wording, editable by the owner; default example `Service Disk_usage_C Critical (C:/Label Serial Number 7258a5cc: 95% used)` |
| Disguise | No app name, sender name, message content or link |
| Phone numbers | Entered by the owner at invite time; verified at first login |
| Sender | Generic gateway number (no registered sender ID); test real delivery in Week 6 |
| Caps | 3 SMS per member per day, 100 per month total (editable) |

**Owner-only admin panel controls:** provider type, API URL, key/secret, sender ID, request format, message template (160 chars, per-member override), offline delay, caps, quiet hours, global on/off, per-member on/off, "send test SMS", delivery log, failure and low-balance warnings.

**Rules**
- Members are told at invite time that alerts look like a system message and what it means; each can switch SMS off.
- The text must not impersonate a real company, bank or vendor.
- Secrets encrypted at rest, write-only in the UI, never sent to the browser; settings changes audit-logged without secret values.
- Outbound requests only to the configured gateway host; block private IP ranges (SSRF protection); fresh login required to change credentials.
- Carriers may filter a disguised alert from a generic number. Revisit sender-ID registration if delivery is unreliable.

---

## 8. Security plan

| Threat | Control |
|---|---|
| Stolen magic link | 10-minute expiry, single use, rate limit, confirmation page before consuming (email scanners), 6-digit code option |
| Reading others' data | RLS on every table, automated tests; users can only insert as themselves; no message edits |
| Public media URLs | No public buckets; 30-second links issued after authorisation; no B2 links shared |
| Account takeover | Magic-link security equals email security: members should use 2-step verification on their email |
| Privilege escalation | Role stored in DB; owner checks on the server and RLS, never trusted from the client |
| DoS / spam | Cloudflare rate limits plus app limits on login, messages and uploads |
| XSS / injection | zod validation on every endpoint, escaped message text, CSP and security headers |
| Malicious uploads | Allowed types only, real type check on server, size limits, random file names, optional ClamAV scan |
| Secrets leak | Secrets only in Docker secrets/env files (permissions 600); `.env.example` only in git; secret scanning in CI |
| Lost key | Master key copy kept offline in a password manager; losing it makes B2 media unreadable |

**Host hardening:** SSH keys only, no root login, firewall denying all inbound traffic, automatic security updates, fail2ban, pinned and regularly updated Docker images.

**n8n on the same VM:** keep Link-C fully isolated (own compose project, network, volumes, secrets; no Docker socket mounted; n8n not publicly exposed; memory limits per container).

**Disk (about 28 GB free, one SATA drive):** Docker images use roughly 8-10 GB. Limits: snaps 2 GB, cache 2 GB, log rotation, alert at 80% disk. No disk redundancy, so backups matter. The disk is not fully encrypted (media is protected by app-level encryption); consider LUKS on a new data partition later.

**Backups:** nightly encrypted `pg_dump` to B2, keep 14, snaps excluded. Test one restore.

---

## 9. Responsive design

| Screen | Layout |
|---|---|
| Desktop (1024 px and up) | Two panes: chat list and conversation |
| Tablet (768-1023 px) | Collapsible list plus conversation |
| Phone (under 768 px) | Single pane with back navigation; iPhone safe-area insets |

Use `100dvh`, test on real Samsung and iPhone Safari, ship a PWA manifest and service worker.

---

## 10. Monthly cost (estimates, verify before relying on them)

| Item | Cost |
|---|---|
| Linux VM, domain, Cloudflare, HTTPS, Sentry, SMTP free tier, LiveKit free tier | $0 |
| Backblaze B2 (first 10 GB free) | $0 |
| SMS (capped at 100/month) | under $2 |
| **Total** | **about $0-2 per month**, plus electricity and internet you already pay |

B2 is free for the first 10 GB, then about $6.95 per TB per month (about $0.007 per GB). 100 GB costs roughly $0.70 a month.

---

## 11. Roadmap (8 weeks, solo with Claude Code)

| Week | Milestone |
|---|---|
| 1 | Docker Compose on the VM, Cloudflare Tunnel, self-hosted Supabase, invite-only magic-link auth, RLS, CI, Backblaze B2 bucket and bucket-scoped key set up and tested |
| 2 | Profiles, conversations, text chat, realtime, responsive shell |
| 3 | Read receipts, typing, presence; normal media pipeline (encrypt, B2, stream back); admin panel skeleton |
| 4 | Snaps: temp storage, one-time and timed view, cleanup job, screenshot flag |
| 5 | Voice and video calls via LiveKit Cloud |
| 6 | Consent-based location, SMS alerts and admin SMS config, real-phone delivery test |
| 7 | Security review, RLS and race-condition tests, hardening checklist, backup restore test |
| 8 | Production run, monitoring, privacy notice at first login, invite first member |

A working text-only chat is the goal for the end of week 2.

---

## 12. Release checklist
- [ ] User A cannot read user B's conversations or media (RLS tests)
- [ ] A one-time snap cannot be fetched twice (race-condition test)
- [ ] Unopened snap deleted after 24 hours; snaps never appear in B2 or backups
- [ ] Used or expired magic link rejected
- [ ] Disallowed file types and oversize uploads rejected
- [ ] A 250 MB video uploads in chunks and resumes after a dropped connection; abandoned uploads are cleaned up after 1 hour
- [ ] XSS test in message text passes
- [ ] B2 application key works and is limited to its one bucket
- [ ] Master key copy stored offline; backup restore tested
- [ ] SMS test delivered to a real phone; caps enforced
- [ ] Privacy notice and SMS disguise notice accepted at first login
- [ ] n8n isolated from Link-C; no inbound ports open
- [ ] Manual test on Chrome desktop, Samsung Chrome, iPhone Safari
- [ ] Secrets scan clean

---

## 13. Decisions log
App name Link-C; consent-based location; LiveKit Cloud; own domain; privacy notice at first login; SMS offline delay 2 minutes; members told about system-style SMS; SMS caps 3/day and 100/month with a generic gateway number; server-side encryption (not E2E); magic-link login; normal media encrypted to a dedicated Backblaze B2 account; snaps temporary on VM only with 24-hour expiry; self-hosted on your Linux VM behind Cloudflare Tunnel.

---

## 14. Build prompt for Claude Code

```
Read link-c-final-plan.md fully. I am a beginner, so explain each step briefly and never skip security.
Start with Week 1 only: create a Docker Compose project "linkc" on my Linux VM (separate network from the
existing n8n container), set up Cloudflare Tunnel, self-hosted Supabase with invite-only magic-link auth
(public sign-up disabled), the database schema from section 3 with Row Level Security on every table,
.env.example, GitHub Actions CI (lint, type-check, tests, dependency and secret scan), the security headers
from section 8, and the Backblaze B2 bucket and key setup from section 5. Write RLS tests proving one user cannot read
another's data. Stop after Week 1 and tell me what to review. Never put secrets in code or git. Implement
location only in the consent-based form from section 6, and media exactly as in section 4.
```
