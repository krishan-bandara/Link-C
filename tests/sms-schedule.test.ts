import { describe, expect, it } from 'vitest';
import { capReached, smsDue, smsTextFor } from '../worker/helpers';

const MIN = 60_000;
const T0 = Date.parse('2026-10-22T10:00:00Z');
const S2 = 5;
const REP = 10;

type State = { step: number; first: number | null; last: number | null; attempt: number | null };
const due = (s: State, now: number, extra: Partial<Parameters<typeof smsDue>[0]> = {}) =>
  smsDue({ step: s.step, firstSentAt: s.first, lastSentAt: s.last, lastAttemptAt: s.attempt, nowMs: now, step2Minutes: S2, repeatMinutes: REP, ...extra });

/** Simulate the worker once per 5 s tick; returns the minute offsets (from T0) at which an SMS went out. */
function simulate(opts: { minutes: number; heartbeatAt?: number[]; failAt?: number[]; dailyCap?: number }) {
  const s: State = { step: 0, first: null, last: null, attempt: null };
  const sent: number[] = [];
  let successes = 0;
  for (let t = 0; t <= opts.minutes * MIN; t += 5_000) {
    const now = T0 + t;
    if (opts.heartbeatAt?.some((h) => h * MIN === t)) {
      s.step = 0;
      s.first = null;
      s.last = null;
      s.attempt = null;
    }
    if (!due(s, now)) continue;
    if (opts.dailyCap !== undefined && successes >= opts.dailyCap) {
      s.attempt = now + 9 * MIN; // cap hit: deferred
      continue;
    }
    s.attempt = now; // claim
    if (opts.failAt?.some((f) => f * MIN <= t && t < f * MIN + 5_000)) continue; // gateway failure, nothing advances
    sent.push(t / MIN);
    successes++;
    if (s.step === 0) s.first = now;
    s.last = now;
    s.step++;
  }
  return sent;
}

describe('smsDue basics', () => {
  it('step 0 is due immediately', () => {
    expect(due({ step: 0, first: null, last: null, attempt: null }, T0)).toBe(true);
  });
  it('step 1 waits step2Minutes from the first SMS', () => {
    const s = { step: 1, first: T0, last: T0, attempt: T0 };
    expect(due(s, T0 + 5 * MIN - 1)).toBe(false);
    expect(due(s, T0 + 5 * MIN)).toBe(true);
  });
  it('step 2 (SMS 3) waits repeatMinutes from the previous SMS', () => {
    const s = { step: 2, first: T0, last: T0 + 100 * MIN, attempt: T0 + 100 * MIN };
    expect(due(s, T0 + 110 * MIN - 1)).toBe(false);
    expect(due(s, T0 + 110 * MIN)).toBe(true);
  });
  it('never sends a 4th SMS: from step 3 on nothing is due', () => {
    for (const step of [3, 4, 9, 50]) {
      const s = { step, first: T0, last: T0, attempt: T0 };
      expect(due(s, T0 + 999 * MIN)).toBe(false);
    }
  });
  it('honours custom settings', () => {
    const s = { step: 2, first: T0, last: T0, attempt: T0 };
    expect(due(s, T0 + 5 * MIN, { repeatMinutes: 5 })).toBe(true);
    expect(due(s, T0 + 4 * MIN, { repeatMinutes: 5 })).toBe(false);
    expect(due({ step: 1, first: T0, last: T0, attempt: T0 }, T0 + 3 * MIN, { step2Minutes: 3 })).toBe(true);
  });
});

describe('retry spacing', () => {
  it('blocks within 60 s of the last attempt, even at step 0', () => {
    const s = { step: 0, first: null, last: null, attempt: T0 };
    expect(due(s, T0 + 59_999)).toBe(false);
    expect(due(s, T0 + 60_000)).toBe(true);
  });
  it('a future lastAttemptAt (deferral) blocks until 60 s after it', () => {
    const s = { step: 0, first: null, last: null, attempt: T0 + 9 * MIN };
    expect(due(s, T0 + 9 * MIN)).toBe(false);
    expect(due(s, T0 + 9 * MIN + 59_999)).toBe(false);
    expect(due(s, T0 + 10 * MIN)).toBe(true);
  });
  it('spacing is configurable', () => {
    const s = { step: 0, first: null, last: null, attempt: T0 };
    expect(due(s, T0 + 5_000, { retrySpacingMs: 5_000 })).toBe(true);
  });
  it('a failed step-1 attempt retries one minute later, not every tick', () => {
    const s = { step: 1, first: T0, last: T0, attempt: T0 + 10 * MIN };
    expect(due(s, T0 + 10 * MIN + 5_000)).toBe(false);
    expect(due(s, T0 + 11 * MIN)).toBe(true);
  });
});

describe('fail closed', () => {
  it('missing or invalid dates are never due (beyond step 0)', () => {
    expect(due({ step: 1, first: null, last: null, attempt: null }, T0)).toBe(false);
    expect(due({ step: 2, first: T0, last: null, attempt: null }, T0 + 999 * MIN)).toBe(false);
    expect(smsDue({ step: 1, firstSentAt: 'garbage', lastSentAt: null, lastAttemptAt: null, nowMs: T0, step2Minutes: 10, repeatMinutes: 19 })).toBe(false);
    expect(smsDue({ step: 3, firstSentAt: T0, lastSentAt: 'nope', lastAttemptAt: null, nowMs: T0 + 999 * MIN, step2Minutes: 10, repeatMinutes: 19 })).toBe(false);
    expect(smsDue({ step: 0, firstSentAt: null, lastSentAt: null, lastAttemptAt: 'nope', nowMs: T0, step2Minutes: 10, repeatMinutes: 19 })).toBe(false);
  });
  it('invalid step, now or minutes are never due', () => {
    expect(due({ step: -1, first: T0, last: T0, attempt: null }, T0 + 999 * MIN)).toBe(false);
    expect(due({ step: 1.5, first: T0, last: T0, attempt: null }, T0 + 999 * MIN)).toBe(false);
    expect(due({ step: 0, first: null, last: null, attempt: null }, NaN)).toBe(false);
    expect(due({ step: 1, first: T0, last: T0, attempt: null }, T0 + 999 * MIN, { step2Minutes: 0 })).toBe(false);
    expect(due({ step: 2, first: T0, last: T0, attempt: null }, T0 + 999 * MIN, { repeatMinutes: NaN })).toBe(false);
  });
  it('null step counts as 0 and ISO strings and Dates are accepted', () => {
    expect(smsDue({ step: null, firstSentAt: null, lastSentAt: null, lastAttemptAt: null, nowMs: T0, step2Minutes: 10, repeatMinutes: 19 })).toBe(true);
    expect(
      smsDue({ step: 1, firstSentAt: new Date(T0).toISOString(), lastSentAt: null, lastAttemptAt: new Date(T0), nowMs: T0 + 10 * MIN, step2Minutes: 10, repeatMinutes: 19 }),
    ).toBe(true);
  });
  it('clock skew: now before the first SMS is not due', () => {
    expect(due({ step: 1, first: T0, last: T0, attempt: null }, T0 - 5 * MIN)).toBe(false);
    expect(due({ step: 2, first: T0, last: T0, attempt: T0 }, T0 - 5 * MIN)).toBe(false);
  });
});

describe('whole timelines', () => {
  it('exactly 3 SMS (at 0, 5 and 15 minutes) with no heartbeat, then silence', () => {
    expect(simulate({ minutes: 600 })).toEqual([0, 5, 15]);
  });
  it('a heartbeat after SMS 2 resets: the next SMS is immediate (step 0) and the clock restarts', () => {
    expect(simulate({ minutes: 60, heartbeatAt: [15] })).toEqual([0, 5, 15, 20, 30]);
  });
  it('a heartbeat before SMS 2 restarts at step 0', () => {
    expect(simulate({ minutes: 30, heartbeatAt: [5] })).toEqual([0, 5, 10, 20]);
  });
  it('a failed first attempt retries after exactly one minute, then follows from the real send', () => {
    expect(simulate({ minutes: 35, failAt: [0] })).toEqual([1, 6, 16]);
  });
  it('a failed SMS 2 retries after one minute; SMS 3 is measured from the successful SMS 2', () => {
    expect(simulate({ minutes: 35, failAt: [5] })).toEqual([0, 6, 16]);
  });
  it('failed attempts do not advance the step (never skips)', () => {
    const sent = simulate({ minutes: 40, failAt: [0, 1, 2] });
    expect(sent[0]).toBe(3);
    expect(sent[1]).toBe(8);
  });
  it('after the cap is hit it defers and sends nothing more', () => {
    expect(simulate({ minutes: 120, dailyCap: 2 })).toEqual([0, 5]);
  });
  it('a person who opens the app and goes offline again gets a fresh round of 3', () => {
    expect(simulate({ minutes: 600, heartbeatAt: [100] })).toEqual([0, 5, 15, 100, 105, 115]);
  });
});

describe('caps count only successful sends', () => {
  it('capReached uses the counts it is given (worker passes only http 2xx rows)', () => {
    expect(capReached({ sentToday: 9, sentThisMonth: 0, dailyCap: 10, monthlyCap: 300 })).toBeNull();
    expect(capReached({ sentToday: 10, sentThisMonth: 0, dailyCap: 10, monthlyCap: 300 })).toBe('daily');
    expect(capReached({ sentToday: 0, sentThisMonth: 300, dailyCap: 10, monthlyCap: 300 })).toBe('monthly');
  });
});

describe('smsTextFor', () => {
  const settings = { template_text: 'T1', template_step2: 'T2', template_step3: 'T3' };
  it('uses step texts', () => {
    expect(smsTextFor(0, null, settings)).toBe('T1');
    expect(smsTextFor(1, null, settings)).toBe('T2');
    expect(smsTextFor(2, null, settings)).toBe('T3');
    expect(smsTextFor(7, null, settings)).toBe('T3');
  });
  it('member override wins at every step', () => {
    for (const step of [0, 1, 2, 5]) expect(smsTextFor(step, { sms_template: 'ME' }, settings)).toBe('ME');
  });
  it('falls back to the default text when a step text is missing or empty', () => {
    expect(smsTextFor(1, { sms_template: null }, { template_text: 'T1', template_step2: null, template_step3: 'T3' })).toBe('T1');
    expect(smsTextFor(4, { sms_template: '' }, { template_text: 'T1', template_step2: 'T2', template_step3: '' })).toBe('T1');
    expect(smsTextFor(2, undefined, { template_text: 'T1' })).toBe('T1');
  });
});

import { dayStart } from '../worker/helpers';

describe('dayStart (local midnight, Asia/Colombo = UTC+5:30)', () => {
  it('returns the previous 18:30Z for a time late in the UTC day', () => {
    expect(dayStart(new Date('2026-10-22T05:34:01Z'), 'Asia/Colombo')).toBe('2026-10-21T18:30:00.000Z');
  });
  it('rolls over exactly at local midnight', () => {
    expect(dayStart(new Date('2026-10-22T18:29:59Z'), 'Asia/Colombo')).toBe('2026-10-21T18:30:00.000Z');
    expect(dayStart(new Date('2026-10-22T18:30:00Z'), 'Asia/Colombo')).toBe('2026-10-22T18:30:00.000Z');
  });
  it('works at a month and year boundary', () => {
    expect(dayStart(new Date('2026-12-31T19:00:00Z'), 'Asia/Colombo')).toBe('2026-12-31T18:30:00.000Z');
  });
});
