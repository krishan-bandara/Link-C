---
name: project-link-c-hd-photos
description: "HD photo sending (2026-10-26): per-photo HD toggle, 4096 px, lighter chat preview, migration 30 NOT yet applied"
metadata:
  type: project
---

Owner asked (2026-10-26) for a WhatsApp-style HD option when sending a photo. Decisions: per-photo "Send in HD" toggle in AttachSheet (off by default); HD = 4096 px longer side, JPEG quality 0.92 (standard stays 2048 px / 0.85); only normal "Keep in chat" JPEG/PNG photos (not snaps, GIF, video); receiver sees a lighter preview in the bubble with an "HD" badge and the full HD file when tapping (Lightbox) or saving.

How it works: `shrinkImage(file, hd)` in src/lib/chat/shrink.ts; `UploadOpts.hd` is client only. The SERVER decides HD, not the client: in src/lib/upload-process.ts, `makeHdPreview` (src/lib/image-preview.ts) writes a 1280 px WebP preview when the cleaned still image is above 2048 px and mode is normal, stores it as a second encrypted object, sets media_items.hd. media_keys got preview_object_key / preview_wrapped_key / preview_size. `/api/media/[id]/stream?v=preview` serves it (falls back to the full file). deleteMediaBlobs and scripts/qa/b2-orphans.mjs know about the preview object.

**Migration `20261026000030_hd_photos.sql` APPLIED to the live DB on 2026-10-27 (verified)**; it had to be in place before deploying (MEDIA_COLS selects `hd`). Photo max stays photo_max_mb (default 10 MB, Admin > Settings); an HD file above it is rejected. Tests: tests/hd-preview.test.ts (304 tests pass, next build OK). Never tried on a real phone.

See [[project-link-c]].
