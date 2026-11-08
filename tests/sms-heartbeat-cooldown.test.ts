// Pure-function test for the presence route's heartbeat reset gate (src/lib/sms.ts heartbeatResetAllowed).
// Confirmed bug (2026-11-08 review): a bare heartbeat used to delete sms_chat_state unconditionally on every "came back"
// event, letting a member reset their own SMS round every ~31-35 s and burn the shared daily pool. This cooldown blocks that.
import { describe, expect, it } from 'vitest';
import { SMS_CHAT_RESET_COOLDOWN_MS, heartbeatResetAllowed } from '../src/lib/sms';

const MIN = 60_000;
const NOW = Date.parse('2026-11-08T10:00:00Z');

describe('heartbeatResetAllowed', () => {
  it('allows the reset when there are no sms_chat_state rows (nothing to reset)', () => {
    expect(heartbeatResetAllowed([], NOW)).toBe(true);
  });

  it('allows the reset when rows exist but have no timestamps yet', () => {
    expect(heartbeatResetAllowed([{ first_at: null, last_sent_at: null, last_attempt_at: null }], NOW)).toBe(true);
  });

  it('blocks the reset right after an SMS was sent (the abuse case: heartbeats every ~31-35 s)', () => {
    const rows = [{ first_at: new Date(NOW - 30_000).toISOString(), last_sent_at: new Date(NOW - 30_000).toISOString(), last_attempt_at: new Date(NOW - 30_000).toISOString() }];
    expect(heartbeatResetAllowed(rows, NOW)).toBe(false);
  });

  it('allows the reset once the cooldown has fully elapsed since the most recent activity', () => {
    const rows = [{ first_at: new Date(NOW - 10 * MIN).toISOString(), last_sent_at: new Date(NOW - SMS_CHAT_RESET_COOLDOWN_MS).toISOString(), last_attempt_at: null }];
    expect(heartbeatResetAllowed(rows, NOW)).toBe(true);
    expect(heartbeatResetAllowed(rows, NOW - 1)).toBe(false); // one ms short of the cooldown
  });

  it('takes the latest of several chats and several columns, not just one', () => {
    const rows = [
      { first_at: new Date(NOW - 20 * MIN).toISOString(), last_sent_at: new Date(NOW - 20 * MIN).toISOString(), last_attempt_at: null },
      { first_at: null, last_sent_at: null, last_attempt_at: new Date(NOW - MIN).toISOString() }, // a different chat, recent
    ];
    expect(heartbeatResetAllowed(rows, NOW)).toBe(false); // the second chat's recent activity still blocks the reset
  });

  it('a deferred (future) last_attempt_at - an active cap/backoff defer - counts as too recent', () => {
    const rows = [{ first_at: null, last_sent_at: null, last_attempt_at: new Date(NOW + 9 * MIN).toISOString() }];
    expect(heartbeatResetAllowed(rows, NOW)).toBe(false);
  });

  it('respects a custom cooldown', () => {
    const rows = [{ first_at: null, last_sent_at: new Date(NOW - MIN).toISOString(), last_attempt_at: null }];
    expect(heartbeatResetAllowed(rows, NOW, 2 * MIN)).toBe(false);
    expect(heartbeatResetAllowed(rows, NOW, 30_000)).toBe(true);
  });
});
