import { describe, expect, it } from 'vitest';

process.env.MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.SIGNING_KEY = Buffer.alloc(32, 9).toString('base64');

const { encryptText } = await import('../src/lib/crypto');
const { readPhone, isUnreadablePhone } = await import('../src/lib/phone');

describe('readPhone', () => {
  it('returns a plain E.164 number as is', () => {
    expect(readPhone('+94771234567')).toBe('+94771234567');
  });
  it('still reads an old encrypted number when the key matches', () => {
    expect(readPhone(encryptText('+94771234567'))).toBe('+94771234567');
  });
  it('treats an encrypted number it cannot decrypt as missing', () => {
    expect(readPhone('v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeNull();
    expect(isUnreadablePhone('v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(true);
  });
  it('returns null for empty or malformed values', () => {
    expect(readPhone(null)).toBeNull();
    expect(readPhone('')).toBeNull();
    expect(readPhone('not a number')).toBeNull();
    expect(isUnreadablePhone(null)).toBe(false);
  });
});
