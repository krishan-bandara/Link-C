---
name: project-link-c-deleted-message-notice
description: "2026-11-08: delete for everyone now keeps a WhatsApp-style 'This message was deleted' notice (messages.deleted_at, migration 35 applied live); code committed, not pushed or deployed"
metadata:
  type: project
---

Owner asked (2026-11-08) that deleting a message or photo shows that it was deleted, like WhatsApp. **How:** "Delete for everyone" (DELETE /api/messages/[id], sender only) no longer removes the row. The server erases the media files (deleteMediaBlobs, files FIRST), blanks body and sticker_id, sets `messages.deleted_at`, removes reactions. Both people see a grey notice with a Ban icon: "You deleted this message" for the sender, "This message was deleted" for the other person; no reply/react/edit/save/delete-for-everyone on it, only "Delete for me"; reply quotes and the chat-list preview say "This message was deleted"; deleted messages are not edit-able and not counted as unread and do not trigger SMS. "Delete for me" is unchanged (hides only for that person).

**Database (migration 35 `message_tombstones`, APPLIED live 2026-11-08):** `messages.deleted_at`, `messages_check` relaxed for deleted text, `grant select (deleted_at) to authenticated` (lesson from the media_items.hd bug: every new column the browser selects needs a grant), `edit_message` refuses deleted messages, `sms_candidates_v3` skips deleted messages. The new code selects `deleted_at` (MSG_COLS), so the migration must exist before the code is deployed (it does). Tests: tests/message-deleted.test.ts. 36 files / 342 tests pass, next build OK. Not tried on a real phone.

See [[project-link-c-media-history-fix-nov8]].
