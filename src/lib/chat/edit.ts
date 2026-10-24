import type { Msg } from './types';

/** How long after sending a text message its sender may still edit it (the server enforces the same 15 minutes). */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const EDIT_MAX_CHARS = 4000;

/** True when `me` may edit this message right now: own plain text, still inside the edit window. */
export function canEdit(msg: Pick<Msg, 'sender_id' | 'type' | 'created_at'>, me: string, now: number = Date.now()): boolean {
  if (msg.type !== 'text' || msg.sender_id !== me) return false;
  const sent = Date.parse(msg.created_at);
  if (Number.isNaN(sent)) return false;
  return now - sent < EDIT_WINDOW_MS;
}

/** Trimmed text if it is a valid edit (1 to 4000 chars and different from the original), else null. */
export function validEditText(next: string, original: string): string | null {
  const t = next.trim();
  if (!t || t.length > EDIT_MAX_CHARS || t === original.trim()) return null;
  return t;
}

/** Friendly text for the errors the edit_message RPC raises. */
export function editErrorText(message: string | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('edit window closed')) return 'Too late to edit: messages can only be edited for 15 minutes.';
  if (m.includes('not allowed')) return 'You cannot edit this message.';
  if (m.includes('invalid text')) return 'The message must be 1 to 4000 characters.';
  return 'Could not save the edit. Try again.';
}
