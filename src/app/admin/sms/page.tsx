import { getSmsSettingsPublic } from '@/lib/sms';
import { adminClient } from '@/lib/supabase/admin';
import { ownerOrRedirect } from '../guard';
import { Badge, EmptyState, Icon, PageHeader, Timeline, absUtc, relTime } from '../kit';
import { LocalTime } from './LocalTime';
import { SmsSettingsForm, TestSmsForm } from './SmsForms';

export const metadata = { title: 'SMS - Admin - Link-C' };

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');
const isOk = (s: string | null) => !!s && /^http 2\d\d$/.test(s);

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

export default async function SmsPage() {
  await ownerOrRedirect();
  const s = await getSmsSettingsPublic();
  const db = adminClient();
  const { data: log } = await db
    .from('sms_log')
    .select('id,user_id,kind,sent_at,provider_status')
    .order('sent_at', { ascending: false })
    .limit(50);
  const recent = (log ?? []).slice(0, 15);
  const ids = [...new Set((log ?? []).map((l) => l.user_id).filter(Boolean))] as string[];
  const { data: names } = ids.length ? await db.from('profiles').select('id,display_name').in('id', ids) : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id as string, n.display_name as string]));
  const last10 = recent.slice(0, 10);
  const failures = last10.filter((l) => !isOk(l.provider_status)).length;
  const now = Date.now();
  const { count: alertable } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .not('phone_enc', 'is', null)
    .eq('sms_alerts_enabled', true);

  return (
    <>
      <PageHeader title="SMS alerts" subtitle="Provider, limits and delivery log." />
      {failures >= 3 && (
        <p role="alert" className="ad-card rise flex items-center gap-3 border-danger text-sm text-danger">
          <Icon name="alert" size={18} />
          {failures} of the last {last10.length} SMS attempts failed. Check the provider URL, credentials and balance.
        </p>
      )}
      {!s.enabled && <p className="text-sm text-muted">SMS alerts are currently disabled.</p>}
      <section className="ad-card rise space-y-3" aria-labelledby="recent-h">
        <div>
          <h2 id="recent-h" className="ad-card-title">
            <Icon name="send" size={18} /> Recent SMS attempts
          </h2>
          <p className="ad-card-sub">The last 15 attempts, with the member each one was for. Phone numbers and message text are never shown.</p>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="SMS status">
          <li>
            <Badge tone={s.enabled ? 'ok' : 'warn'} icon={s.enabled ? 'check' : 'alert'}>
              SMS {s.enabled ? 'enabled' : 'disabled'}
            </Badge>
          </li>
          <li>
            <Badge tone={s.api_url ? 'ok' : 'bad'} icon={s.api_url ? 'check' : 'alert'}>
              Gateway URL {s.api_url ? 'saved' : 'missing'}
            </Badge>
          </li>
          <li>
            <Badge tone={s.hasCredentials ? 'ok' : 'bad'} icon={s.hasCredentials ? 'check' : 'alert'}>
              Credentials {s.hasCredentials ? 'saved' : 'missing'}
            </Badge>
          </li>
          <li>
            <Badge tone={(alertable ?? 0) > 0 ? 'ok' : 'warn'} icon="users">
              {alertable ?? 0} {alertable === 1 ? 'member' : 'members'} with a number and alerts on
            </Badge>
          </li>
        </ul>
        {recent.length ? (
          <ul className="divide-y divide-line">
            {recent.map((r) => {
              const ok = isOk(r.provider_status);
              return (
                <li key={r.id as string} className="flex flex-col gap-0.5 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-muted">
                      <LocalTime iso={r.sent_at as string} />
                    </span>
                    <span className="font-medium">{r.user_id ? (nameOf.get(r.user_id as string) ?? 'removed member') : '-'}</span>
                    <Badge tone="neutral">{r.kind}</Badge>
                    <span className={`ad-mono break-all ${ok ? 'text-accent' : 'text-danger'}`}>{r.provider_status ?? '-'}</span>
                  </div>
                  <p className="text-xs text-muted [overflow-wrap:anywhere]">{explain(r.provider_status)}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="message" title="No attempts yet" text="Each SMS attempt will be listed here." />
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
      <div className="ad-cols ad-cols-wide">
        <section className="ad-card rise" aria-labelledby="log-h">
          <h2 id="log-h" className="ad-card-title mb-3">
            <Icon name="list" size={18} /> Delivery log <span className="text-sm font-normal text-muted">(last 50)</span>
          </h2>
          {log?.length ? (
            <div className="ad-scroll">
              <Timeline
                label="SMS delivery log"
                items={log.map((l) => {
                  const ok = isOk(l.provider_status);
                  return {
                    id: l.id as string,
                    icon: ok ? 'check' : 'alert',
                    tone: ok ? 'green' : 'red',
                    title: `${l.user_id ? (nameOf.get(l.user_id) ?? 'removed') : '-'} · ${l.kind}`,
                    sub: <span className={ok ? 'text-accent' : 'text-danger'}>{l.provider_status ?? '-'}</span>,
                    time: relTime(l.sent_at, now),
                    abs: absUtc(l.sent_at),
                  };
                })}
              />
            </div>
          ) : (
            <EmptyState icon="message" title="No SMS sent yet" text="Deliveries and failures will show up here." />
          )}
        </section>
        <TestSmsForm />
      </div>
    </>
  );
}
