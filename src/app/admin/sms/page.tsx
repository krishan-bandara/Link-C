import Link from 'next/link';
import { getSmsSettingsPublic } from '@/lib/sms';
import { adminClient } from '@/lib/supabase/admin';
import { ownerOrRedirect } from '../guard';
import { Badge, Icon, PageHeader, btnCls } from '../kit';
import { LocalTime } from './LocalTime';
import { SmsSettingsForm, TestSmsForm } from './SmsForms';
import './sms.css';

export const metadata = { title: 'SMS - Admin - Link-C' };

const PAGE_SIZE = 25;
const MAX_DAYS = 92;
const DAY_MS = 86_400_000;
const COLOMBO_MS = 5.5 * 3_600_000; // Asia/Colombo is a fixed +05:30 (no DST)

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');
const isOk = (s: string | null) => !!s && /^http 2\d\d$/.test(s);

/** YYYY-MM-DD to the UTC ms of that day's midnight in Colombo, or null if not a real date. */
function dayStart(d: string | undefined): number | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [y, m, day] = d.split('-').map(Number);
  const u = Date.UTC(y, m - 1, day);
  if (new Date(u).toISOString().slice(0, 10) !== d) return null;
  return u - COLOMBO_MS;
}
const ymd = (ms: number) => new Date(ms + COLOMBO_MS).toISOString().slice(0, 10);

function explain(status: string | null): string {
  const t = (status ?? '').trim();
  if (/^http 2\d\d$/.test(t)) return 'Accepted by the gateway.';
  if (/^http [45]\d\d$/.test(t)) return 'The gateway refused it. Check the URL, credentials, balance and number format.';
  const m: Record<string, string> = {
    'error credentials':
      'The saved gateway credentials cannot be decrypted (the server key changed or is missing). Open Admin > SMS, re-enter BOTH the API key and the API secret, and save: saving re-encrypts them.',
    'error phone unreadable': `The stored number cannot be read. Re-enter it: open Members, then the person's three-dot menu, then Phone number.`,
    'error gateway rejected': 'The gateway answered OK but its reply looks like an error. Check the credentials, sender ID and balance.',
    'error settings unavailable': 'The SMS settings could not be read from the database, so nothing was sent. Check the database connection and that the latest migration is applied.',
    'cap reached': 'The daily or monthly SMS limit was reached, so sending is paused.',
    'error send failed': 'The server could not complete the send. Check the server logs.',
    'error no phone': 'This person has no phone number saved.',
    'error blocked address': 'The gateway address is blocked (private or not https on port 443).',
    'error dns': 'The gateway address could not be found (DNS).',
    'error timeout': 'The gateway did not answer in time.',
    'error tls': 'The secure connection to the gateway failed (certificate).',
    'error connection': 'The connection to the gateway was refused or dropped.',
    'error request failed': 'The request to the gateway failed.',
    'sms disabled': 'SMS alerts were switched off, so nothing was sent.',
  };
  return m[t] ?? t;
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SmsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await ownerOrRedirect();
  const sp = await searchParams;

  // Date range in Colombo days. Garbage is ignored; a single date means that one day.
  const todayMs = dayStart(ymd(Date.now())) as number;
  let fromMs = dayStart(one(sp.from));
  let toMs = dayStart(one(sp.to));
  if (fromMs === null && toMs !== null) fromMs = toMs;
  if (toMs === null && fromMs !== null) toMs = fromMs;
  let note = '';
  if (fromMs === null || toMs === null) {
    fromMs = toMs = todayMs;
  } else if (fromMs > toMs) {
    note = 'The start date was after the end date, so showing today instead.';
    fromMs = toMs = todayMs;
  } else if ((toMs - fromMs) / DAY_MS + 1 > MAX_DAYS) {
    note = `Ranges are limited to ${MAX_DAYS} days, so showing today instead.`;
    fromMs = toMs = todayMs;
  }
  const from = ymd(fromMs);
  const to = ymd(toMs);
  const startIso = new Date(fromMs).toISOString();
  const endIso = new Date(toMs + DAY_MS).toISOString();
  const pageNo = Math.min(200, Math.max(1, Math.floor(Number(one(sp.page))) || 1));

  const s = await getSmsSettingsPublic();
  const db = adminClient();
  const inRange = () => db.from('sms_log').select('id', { count: 'exact', head: true }).gte('sent_at', startIso).lt('sent_at', endIso);
  const [{ data: log }, totalQ, okQ, testQ, aq] = await Promise.all([
    db
      .from('sms_log')
      .select('id,user_id,kind,sent_at,provider_status')
      .gte('sent_at', startIso)
      .lt('sent_at', endIso)
      .order('sent_at', { ascending: false })
      .range(0, pageNo * PAGE_SIZE), // one extra row tells us whether there is more
    inRange(),
    inRange().like('provider_status', 'http 2%'),
    inRange().eq('kind', 'test'),
    db.from('profiles').select('id', { count: 'exact', head: true }).not('phone_enc', 'is', null).eq('sms_alerts_enabled', true),
  ]);
  const rows = log ?? [];
  const hasMore = rows.length > pageNo * PAGE_SIZE;
  const shown = rows.slice(0, pageNo * PAGE_SIZE);
  const ids = [...new Set(shown.map((l) => l.user_id).filter(Boolean))] as string[];
  const { data: names } = ids.length ? await db.from('profiles').select('id,display_name').in('id', ids) : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id as string, n.display_name as string]));
  const total = totalQ.count ?? 0;
  const accepted = okQ.count ?? 0;
  const tests = testQ.count ?? 0;
  const alertable = aq.count ?? 0;

  const today = ymd(Date.now());
  const yesterday = ymd(todayMs - DAY_MS);
  const week = ymd(todayMs - 6 * DAY_MS);
  const month = today.slice(0, 8) + '01';
  const chips: [string, string, string][] = [
    ['Today', today, today],
    ['Yesterday', yesterday, yesterday],
    ['Last 7 days', week, today],
    ['This month', month, today],
  ];
  const qs = (f: string, t: string, p?: number) => `?from=${f}&to=${t}${p ? `&page=${p}` : ''}`;
  const rangeLabel = from === to ? from : `${from} to ${to}`;

  const gatewayMissing = [!s.api_url && 'URL', !s.hasCredentials && 'credentials'].filter(Boolean).join(' and ');
  const ready = !gatewayMissing;

  return (
    <div className="sms-page">
      <PageHeader title="SMS alerts" subtitle="Delivery log and settings." />
      <div className="sms-status" aria-label="SMS status">
        <Badge tone={s.enabled && ready ? 'ok' : 'warn'} icon={s.enabled && ready ? 'check' : 'alert'}>
          SMS {s.enabled ? 'on' : 'off'}
          {ready ? ', gateway ready' : `, gateway ${gatewayMissing} missing`}
        </Badge>
        <Badge tone={alertable > 0 ? 'ok' : 'warn'} icon="users">
          {alertable} {alertable === 1 ? 'member' : 'members'} with alerts on
        </Badge>
      </div>

      <section className="ad-card rise sms-card" aria-labelledby="log-h">
        <h2 id="log-h" className="ad-card-title">
          <Icon name="list" size={18} /> Delivery log
        </h2>
        <form method="get" className="sms-filter">
          <div className="sms-dates">
            <label className="ad-field">
              <span className="ad-label">From</span>
              <input type="date" name="from" defaultValue={from} max={today} className="ad-input" />
            </label>
            <label className="ad-field">
              <span className="ad-label">To</span>
              <input type="date" name="to" defaultValue={to} max={today} className="ad-input" />
            </label>
          </div>
          <button type="submit" className={`${btnCls} sms-apply`}>
            Show
          </button>
        </form>
        <nav className="sms-chips" aria-label="Quick ranges">
          {chips.map(([label, f, t]) => (
            <Link key={label} href={qs(f, t)} className="sms-chip" aria-current={f === from && t === to ? 'true' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        {note && (
          <p role="status" className="text-sm text-muted">
            {note}
          </p>
        )}
        <p className="sms-summary">
          {rangeLabel} (Sri Lanka time): {accepted} accepted, {Math.max(0, total - accepted)} failed, {tests} {tests === 1 ? 'test' : 'tests'}.
        </p>
        {shown.length ? (
          <ul className="sms-rows">
            {shown.map((r) => {
              const ok = isOk(r.provider_status);
              return (
                <li key={r.id as string}>
                  <div className="sms-row-top">
                    <span className="text-muted">
                      <LocalTime iso={r.sent_at as string} />
                    </span>
                    <span className="sms-name">{r.user_id ? (nameOf.get(r.user_id as string) ?? 'removed member') : '-'}</span>
                    <Badge tone="neutral">{r.kind}</Badge>
                  </div>
                  <p className={`sms-row-note ${ok ? 'sms-ok' : 'sms-bad'}`}>{explain(r.provider_status) || '-'}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="sms-empty">No SMS attempts in this period.</p>
        )}
        {hasMore && (
          <Link href={qs(from, to, pageNo + 1)} className={`${btnCls} ad-btn-ghost sms-more`}>
            Show more
          </Link>
        )}
      </section>

      <SmsSettingsForm
        v={{
          enabled: s.enabled,
          api_url: s.api_url ?? '',
          http_method: s.http_method,
          request_format: s.request_format,
          body_template: s.body_template,
          headers_template: s.headers_template,
          sender_id: s.sender_id ?? '',
          template_text: s.template_text,
          offline_after_seconds: s.offline_after_seconds,
          step2_after_minutes: s.step2_after_minutes,
          repeat_every_minutes: s.repeat_every_minutes,
          template_step2: s.template_step2 ?? '',
          template_step3: s.template_step3 ?? '',
          daily_cap: s.daily_cap,
          monthly_cap: s.monthly_cap,
          quiet_start: hhmm(s.quiet_start),
          quiet_end: hhmm(s.quiet_end),
          hasCredentials: s.hasCredentials,
        }}
      />
      <TestSmsForm />
    </div>
  );
}
