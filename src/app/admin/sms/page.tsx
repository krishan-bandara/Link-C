import { getSmsSettingsPublic } from '@/lib/sms';
import { adminClient } from '@/lib/supabase/admin';
import { ownerOrRedirect } from '../guard';
import { EmptyState, Icon, PageHeader, Timeline, absUtc, relTime } from '../kit';
import { SmsSettingsForm, TestSmsForm } from './SmsForms';

export const metadata = { title: 'SMS - Admin - Link-C' };

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');
const isOk = (s: string | null) => !!s && /^http 2\d\d$/.test(s);

export default async function SmsPage() {
  await ownerOrRedirect();
  const s = await getSmsSettingsPublic();
  const db = adminClient();
  const { data: log } = await db
    .from('sms_log')
    .select('id,user_id,kind,sent_at,provider_status')
    .order('sent_at', { ascending: false })
    .limit(50);
  const ids = [...new Set((log ?? []).map((l) => l.user_id).filter(Boolean))] as string[];
  const { data: names } = ids.length ? await db.from('profiles').select('id,display_name').in('id', ids) : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id as string, n.display_name as string]));
  const failures = (log ?? []).slice(0, 10).filter((l) => !isOk(l.provider_status)).length;
  const now = Date.now();

  return (
    <>
      <PageHeader title="SMS alerts" subtitle="Provider, limits and delivery log." />
      {failures >= 3 && (
        <p role="alert" className="ad-card rise flex items-center gap-3 border-danger text-sm text-danger">
          <Icon name="alert" size={18} />
          {failures} of the last 10 SMS attempts failed. Check the provider URL, credentials and balance.
        </p>
      )}
      {!s.enabled && <p className="text-sm text-muted">SMS alerts are currently disabled.</p>}
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
          step3_after_minutes: s.step3_after_minutes,
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
