import { describe, expect, it } from 'vitest';
import { gatewayRejected } from '@/lib/sms-response';

describe('gatewayRejected', () => {
  it('accepts Notify.lk-style success', () => {
    expect(gatewayRejected('{"status":"success","data":"Sent"}')).toBe(false);
  });
  it('rejects status error / fail variants', () => {
    expect(gatewayRejected('{"status":"error","message":"Invalid sender"}')).toBe(true);
    expect(gatewayRejected('{"status":"Failed"}')).toBe(true);
    expect(gatewayRejected('{"status":"rejected"}')).toBe(true);
  });
  it('rejects success/ok false and error true or non-empty string', () => {
    expect(gatewayRejected('{"success":false}')).toBe(true);
    expect(gatewayRejected('{"ok":false}')).toBe(true);
    expect(gatewayRejected('{"error":true}')).toBe(true);
    expect(gatewayRejected('{"error":"bad"}')).toBe(true);
  });
  it('does not treat null/false/0/empty error as failure', () => {
    for (const e of ['null', 'false', '0', '""']) expect(gatewayRejected(`{"error":${e},"id":1}`)).toBe(false);
  });
  it('handles plain text', () => {
    expect(gatewayRejected('Message queued')).toBe(false);
    expect(gatewayRejected('OK accepted, no error')).toBe(false);
    expect(gatewayRejected('Unauthorized')).toBe(true);
    expect(gatewayRejected('Insufficient balance')).toBe(true);
    expect(gatewayRejected('something odd')).toBe(false);
  });
  it('accepts an empty body', () => {
    expect(gatewayRejected('')).toBe(false);
    expect(gatewayRejected('   ')).toBe(false);
  });
  it('handles invalid and truncated JSON as text', () => {
    expect(gatewayRejected('{"status":"succ')).toBe(false);
    expect(gatewayRejected('{"status":"error","mess')).toBe(true);
  });
});
