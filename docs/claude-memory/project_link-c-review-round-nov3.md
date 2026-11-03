---
name: project-link-c-review-round-nov3
description: "2026-11-03: 20 review agents + 11 fix agents over SMS/HD/offline/snaps/uploads/deploy; migrations 32+33 written NOT applied; nothing committed or deployed"
metadata:
  type: project
---

On 2026-11-03 the owner asked for a parallel review (20 read-only agents) then fixes (11 agents, one owner per file). Result: tsc clean, `next build` OK, 33 test files / 331 tests pass. Committed locally as 4f59b3b "Review fixes: SMS worker, HD limits, offline wipe, snaps, uploads, deploy script" (on top of 72eef15). NOT pushed (the auto-mode classifier blocked `git push`; owner pushes manually with `git push origin main`) and NOT deployed (use `.\scripts\deploy.ps1 -DeployOnly` after pushing and applying migrations). Migrations 32 and 33 are written but NOT applied to the live DB (the claude.ai Supabase connector was not signed in; owner must run /mcp and sign in to the personal link-c account, then Claude applies them).

**STATUS (2026-11-03, later): DONE.** Commit 4f59b3b is pushed to GitHub and was already deployed on the Oracle server (containers rebuilt 01:56 UTC, after the commit; app HTTP 200, worker started, no errors). Migrations 32 and 33 APPLIED to the live link-c DB (project kjjyplcqobbojrjvlylb) via the Supabase connector after the owner ran /mcp; verified: sms_settings = 30 s / 5 / 10, the 5 member functions are security definer, no anon execute. Server gotcha: `git pull` from the server now fails with "Permission denied (publickey)" (server ~/.ssh has github_linkc key but no ~/.ssh/config, only config.bak), so `deploy.ps1 -DeployOnly` stops at git pull; docs-only commit 6e16fa4 is not on the server (harmless). Fix next time: restore the ssh config on the server (do not print keys). The rls.sql tests are still not run.

(Older note below, written before the apply.)
**Migration 32** (`20261103000032_sms_schedule_values.sql`): sets Admin SMS values 30 s / 5 / 10 min but only overwrites the OLD defaults (45, 8 or 10, 19), plus new column defaults. `src/lib/sms.ts` fallbacks now 5 / 10; worker fallbacks 30 s / 5 / 10.
**Migration 33** (`20261103000033_member_tools_hardening.sql`): clear_chat, hide_message, set_chat_mute, set_chat_star, edit_message require an active user; past mute time = unmuted; no-op edit keeps edited_at. New RLS tests appended to `supabase/tests/rls.sql` were NOT run (assumptions about auth.sessions / user_prefs columns need a test DB).

**Code fixed:** worker (timeout/network error is no longer rolled back = at-most-once, backoff counts only gateway failures, null-date SMS rows no longer stuck, fairness order); presence rate limit 60/min + heartbeat back-off; server-side 4096 px / 300 frame image limits, cleanup try blocks; iPhone-safe HD shrink (12 MP cap); photo bubble/Lightbox labels + retry; admin SMS validation (quiet range both-or-none, monthly >= daily, no reset link for other owners); sms-response checks more error keys; offline wipe awaited on logout/idle/login page, 24 h viewer max age, outbox waits for user confirmation; snap blob delete retry, atomic screenshot notice, preview not served for download; upload disk cap x3, 2 concurrent processUpload, 4 chunk requests per user (in-process, single instance only); chat list refresh on reconnect and out-of-order guard; deploy.ps1 (confirm prompt, strict ssh, chown before up, health check), compose log limits, .dockerignore/.gitignore.

**Left open (owner decisions):** login lock keyed only on email (anyone can lock the owner out; email+IP would weaken brute-force protection); video snap token still replayable for 10 min; client_id column for offline duplicate safety; Admin look/accessibility review agent never ran (concurrency limit); lightbox does not show the blurred preview underneath; HD bubble layout shift (needs width/height stored at upload); screenshot flag no longer fires on blur alone.

See [[project-link-c-sms-schedule]], [[project-link-c-hd-photos]], [[project-link-c-deploy-script]].
