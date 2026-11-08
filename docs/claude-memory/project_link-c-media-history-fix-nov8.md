---
name: project-link-c-media-history-fix-nov8
description: "2026-11-08: old photos/videos/voice notes did not load (missing column grant media_items.hd, migration 34 applied live); 25-agent review and fix round; NOT pushed or deployed"
metadata:
  type: project
---

**Bug (owner report):** media showed when sent live but NOT when opened later. **Cause:** migration 30 added `media_items.hd` but never granted SELECT on it to `authenticated` (column-level grants). The chat history query (`MEDIA_COLS` in src/lib/chat/types.ts) selects `hd`, so the whole query was refused, `page.tsx` ignored the error and showed grey placeholders. Live updates came through realtime payloads, so they worked. **Fix:** migration `20261108000034_media_hd_grant.sql` APPLIED live on 2026-11-08 (verified by simulating both participants' history queries as role authenticated). Committed as 8cd1576 with the README rewrite.

**Review + fix round (2026-11-08):** 24 read-only review agents, then 7 fix agents (one owner per file). Fixed: silent supabase `error` handling across chat page, ChatView (media retry, refetch ghosts/gaps, load-earlier, resubscribe, clear chat), chat list, prefs, stickers, auth, media routes (500 not fake 404/410), stream route (first chunk read before headers; image snap burned only after first chunk), CachedStore (big files, eviction race, truncated download), uploads (worker no longer kills slow processing uploads before 3 h, chunk race, disk cap x4.5, client retries on 429), players (video/audio retry, iOS snap autoplay, Safari voice mp4, holdAlive so playback is not idle-logged-out), small API routes, new tests `tests/column-grants.test.ts` and `tests/cached-store.test.ts`. tsc clean, 35 files / 339 tests pass, `next build` OK. These code changes are committed locally; the owner must push and deploy (`scripts/deploy.ps1`). The DB fix is already live.

**Not fixed (owner decisions / bigger):** middleware cookie refresh race and `refresh_token_not_found` log noise (hypothesis, needs testing); standard photos have no preview (only HD) so each view downloads the full file (cache header now max-age 3600); offline outbox duplicate window and 24 h at-rest limit; RefreshGuard pagehide logout beacon on iOS; PrivacyShield on blur; worker `sms alerts failed: Internal server error` looks like a transient Supabase 5xx (labels added to name the failing call); video HEVC/VP9 not transcoded; Supabase leaked-password protection still off; eslint error in next-env.d.ts.

See [[project-link-c]], [[project-link-c-hd-photos]].
