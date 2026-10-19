// Password strength rules. Used on the server (the real check) and, loaded lazily, in the browser (live meter).
// Importing this module pulls in the zxcvbn dictionaries (about 400 KB), so client code should
// `await import('@/lib/password')` only on pages that need it (invite page, change-password).
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as en from '@zxcvbn-ts/language-en';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_MIN_SCORE } from './auth-policy';

let factory: ZxcvbnFactory | null = null;
function engine(): ZxcvbnFactory {
  return (factory ??= new ZxcvbnFactory({
    translations: en.translations,
    graphs: common.adjacencyGraphs,
    dictionary: { ...common.dictionary, ...en.dictionary },
  }));
}

export type PasswordCheck = {
  ok: boolean;
  /** 0 very weak ... 4 very strong */
  score: 0 | 1 | 2 | 3 | 4;
  /** Short, plain-language reasons the password is not accepted yet (empty when ok). */
  problems: string[];
  /** One friendly tip to improve it. */
  tip: string | null;
  /** 0..100 for a progress bar. */
  percent: number;
};

const tokens = (s: string | undefined, min: number) =>
  (s ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= min);

/** Checks a candidate password. `ctx` words (email parts, name) must not appear in it. */
export function checkPassword(password: string, ctx: { email?: string; name?: string } = {}): PasswordCheck {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (password.length > PASSWORD_MAX_LENGTH) problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);

  const personal = [...tokens(ctx.email?.split('@')[0], 4), ...tokens(ctx.name, 3)];
  const lower = password.toLowerCase();
  if (personal.some((w) => lower.includes(w))) problems.push('Do not use your name or email in the password.');

  const r = password ? engine().check(password.slice(0, PASSWORD_MAX_LENGTH), personal) : null;
  const score = (r?.score ?? 0) as 0 | 1 | 2 | 3 | 4;
  if (password && score < PASSWORD_MIN_SCORE) problems.push('This password is too easy to guess.');

  const tip = r?.feedback.warning || r?.feedback.suggestions?.[0] || (password.length < PASSWORD_MIN_LENGTH ? 'A few random words make a strong password.' : null);
  const lengthPart = Math.min(1, password.length / 16);
  const percent = Math.round(Math.min(100, (score / 4) * 70 + lengthPart * 30));
  return { ok: problems.length === 0, score, problems, tip, percent };
}
