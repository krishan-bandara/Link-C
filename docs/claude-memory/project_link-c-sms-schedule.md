---
name: project-link-c-sms-schedule
description: "SMS alert schedule decided 2026-10-27: max 3 SMS PER CHAT (0, +5 min, +10 min), reset when the person opens the app, first after 30 s offline, owner no-SMS time range; migration 31"
metadata:
  type: project
---

Owner decision (2026-10-27, replaces the old "every 19 min until they open the app" rule): at most **3 SMS per offline period**, then silence until the person opens the app (a heartbeat resets the count; going offline again with an unread message starts a fresh round of 3). SMS 1 as soon as the recipient is offline with an unread message (Admin > SMS "SMS 1: offline after" = 30 s, the minimum), SMS 2 five minutes after SMS 1 (`step2_after_minutes` = 5), SMS 3 ten minutes after SMS 2 (`repeat_every_minutes` = 10; now used only for SMS 3). No SMS in the owner's range (Admin > SMS "No SMS from / until", Colombo time, existing `quiet_start`/`quiet_end`); SMS only, push untouched; an alert that falls due inside the range is not sent, and one catch-up SMS goes out when the range ends if the person is still offline and unread (owner was told and may ask to remove it).

**PER CHAT (owner clarification 2026-10-27):** the limit of 3 applies to EACH CHAT (thread) separately, not to the person overall. Two chats with unread messages = two independent rounds (up to 6 SMS); more messages in a chat that already had its 3 SMS send nothing; a message in another chat starts that chat's own SMS 1. When the person opens the app (heartbeat) all their rounds are deleted, so going offline again restarts every chat's cycle. State lives in table `sms_chat_state` (user_id, conversation_id, step, first_at, last_sent_at, last_attempt_at), candidates come from `sms_candidates_v3`, both in migration `20261027000031_sms_per_chat.sql` (APPLIED to the live DB on 2026-10-27 and verified: RLS on, no browser access, service role only; must be in place BEFORE the worker and heartbeat route are deployed; the old presence_state.sms_* columns are no longer used). On 2026-10-27 Admin > SMS still held the old values 45 s / 8 min / 19 min until the owner saves 30 / 5 / 10. Cost note: several unread chats means several identical SMS at once, all counted in the shared daily pool.

Code: `MAX_SMS_PER_PERIOD = 3` and `smsDue` in worker/helpers.ts (no DB setting). The three timings are VALUES the owner must enter in Admin > SMS (30 / 5 / 10); the DB still holds the old ones until saved. Heartbeat (src/app/(app)/components/Heartbeat.tsx) now every 10 s so a 30 s offline threshold does not fire for people who are using the app. Worker must be rebuilt to take effect (`sudo docker compose up -d --build --force-recreate`). Daily pool (75, shared) and monthly cap unchanged.

See [[project-link-c-hosting-oracle]] (older SMS history).
