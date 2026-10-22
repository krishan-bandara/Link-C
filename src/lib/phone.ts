import { decryptText } from '@/lib/crypto';

// Phone numbers are stored as plain E.164 text (e.g. +94771234567) in the profiles.phone_enc and invites.phone_enc
// columns (the column names are historical). Numbers saved before this change are still encrypted ("v1:..."):
// they are read when the current MASTER_KEY can decrypt them; otherwise they count as missing and the owner re-enters them.

const E164 = /^\+[1-9]\d{7,14}$/;

/** The plain number, or null when nothing is stored or an old encrypted value cannot be decrypted. */
export function readPhone(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith('v1:')) {
    try {
      return decryptText(stored);
    } catch {
      return null;
    }
  }
  return E164.test(stored) ? stored : null;
}

/** True for an old encrypted value that is stored but cannot be read with the current key. */
export function isUnreadablePhone(stored: string | null | undefined): boolean {
  return !!stored && readPhone(stored) === null;
}
