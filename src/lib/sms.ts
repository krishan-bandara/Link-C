import { decryptText } from '@/lib/crypto';
import { adminClient } from '@/lib/supabase/admin';
import { safeRequest } from '@/lib/ssrf';

// No next/* imports here: this file is shared with the worker process.

export type SmsKind = 'alert' | 'test' | 'verify';

const E164 = /^\+[1-9]\d{7,14}$/;

export function validateE164(s: string): boolean {
  return E164.test(s);
}

/** +94771234567 -> +94••••••567 (never log or render a full number). */
export function maskPhone(s: string): string {
  if (s.length < 8) return '••••';
  return `${s.slice(0, 3)}${'•'.repeat(Math.max(s.length - 6, 3))}${s.slice(-3)}`;
}

export interface SmsSettingsPublic {
  enabled: boolean;
  provider: string;
  api_url: string | null;
  http_method: 'POST' | 'GET';
  request_format: 'json' | 'form' | 'query';
  body_template: string;
  headers_template: string;
  sender_id: string | null;
  template_text: string;
  offline_after_seconds: number;
  daily_cap: number;
  monthly_cap: number;
  quiet_start: string | null;
  quiet_end: string | null;
  updated_at: string;
  hasCredentials: boolean;
}

export async function getSmsSettingsPublic(): Promise<SmsSettingsPublic> {
  const { data, error } = await adminClient().from('sms_settings').select('*').eq('id', 1).single();
  if (error || !data) throw new Error('sms settings unavailable');
  const { credentials_enc, id: _id, ...rest } = data as Record<string, unknown> & { credentials_enc: string | null };
  void _id;
  return { ...(rest as Omit<SmsSettingsPublic, 'hasCredentials'>), hasCredentials: !!credentials_enc };
}

const PLACEHOLDER = /\{(to|text|sender|apiKey|apiSecret|basicAuth|toDigits)\}/g;
type Values = Record<'to' | 'text' | 'sender' | 'apiKey' | 'apiSecret' | 'basicAuth' | 'toDigits', string>;

const jsonEscape = (v: string) => JSON.stringify(v).slice(1, -1);

/** Single pass substitution so a value containing "{text}" is never expanded again. */
function fill(tpl: string, values: Values, esc: (v: string) => string): string {
  return tpl.replace(PLACEHOLDER, (_m, k: keyof Values) => esc(values[k]));
}

function shortError(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  const code = (e as { code?: string } | null)?.code;
  if (msg === 'timeout') return 'error timeout';
  if (code === 'EBLOCKED') return 'error blocked address';
  if (code === 'ENOTFOUND') return 'error dns';
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return 'error connection';
  if (/certificate|SSL|TLS/i.test(msg) || /CERT|SSL/.test(code ?? '')) return 'error tls';
  return 'error request failed';
}

async function logSms(userId: string | null, kind: SmsKind, status: string, periodStartedAt?: string) {
  await adminClient()
    .from('sms_log')
    .insert({ user_id: userId, kind, provider_status: status, period_started_at: periodStartedAt ?? null });
}

export async function sendSms(opts: {
  to: string;
  text: string;
  userId: string | null;
  kind: SmsKind;
  periodStartedAt?: string;
}): Promise<{ ok: boolean; status: string }> {
  const { data: s } = await adminClient().from('sms_settings').select('*').eq('id', 1).single();
  if (!s || !s.enabled || !s.api_url) return { ok: false, status: 'sms disabled' };

  const fail = async (status: string) => {
    await logSms(opts.userId, opts.kind, status, opts.periodStartedAt);
    return { ok: false, status };
  };

  if (!validateE164(opts.to)) return fail('error bad number');

  let creds: { apiKey?: string; apiSecret?: string } = {};
  try {
    if (s.credentials_enc) creds = JSON.parse(decryptText(s.credentials_enc));
  } catch {
    return fail('error credentials');
  }

  const values: Values = {
    to: opts.to,
    toDigits: opts.to.replace(/^\+/, ''), // 94771234567, for gateways that want no plus sign
    text: opts.text,
    sender: s.sender_id ?? '',
    apiKey: creds.apiKey ?? '',
    apiSecret: creds.apiSecret ?? '',
    // base64(apiKey:apiSecret) for HTTP Basic auth, e.g. Twilio: {"Authorization":"Basic {basicAuth}"}
    basicAuth: Buffer.from(`${creds.apiKey ?? ''}:${creds.apiSecret ?? ''}`).toString('base64'),
  };
  const format = s.request_format as 'json' | 'form' | 'query';

  let headers: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(fill(s.headers_template || '{}', values, jsonEscape));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('headers');
    headers = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== 'string' || /[\r\n]/.test(k + v)) throw new Error('headers');
      headers[k] = v;
    }
  } catch {
    return fail('error bad headers template');
  }

  let url = s.api_url as string;
  let body: string | undefined;
  const method = s.http_method as 'GET' | 'POST';
  if (format === 'json') {
    body = fill(s.body_template, values, jsonEscape);
    try {
      JSON.parse(body);
    } catch {
      return fail('error bad body template');
    }
    headers['Content-Type'] ??= 'application/json';
  } else {
    const qs = fill(s.body_template, values, encodeURIComponent);
    if (format === 'form' && method === 'POST') {
      body = qs;
      headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
    } else {
      url += (url.includes('?') ? '&' : '?') + qs.replace(/^[?&]/, '');
    }
  }
  if (method === 'GET') body = undefined;

  try {
    const res = await safeRequest(url, { method, headers, body, timeoutMs: 10_000 });
    const status = `http ${res.status}`;
    await logSms(opts.userId, opts.kind, status, opts.periodStartedAt);
    return { ok: res.status >= 200 && res.status < 300, status };
  } catch (e) {
    return fail(shortError(e));
  }
}
