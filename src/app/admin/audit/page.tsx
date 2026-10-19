import { adminClient } from '@/lib/supabase/admin';
import { ownerOrRedirect } from '../guard';
import { PageHeader, absUtc, relTime } from '../kit';
import { AuditList } from './AuditList';

export const metadata = { title: 'Audit - Admin - Link-C' };

export default async function AuditPage() {
  await ownerOrRedirect();
  const db = adminClient();
  const { data: rows } = await db.from('audit_log').select('id,actor_id,action,target,at').order('at', { ascending: false }).limit(100);
  const ids = [...new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: names } = ids.length ? await db.from('profiles').select('id,display_name').in('id', ids) : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id as string, n.display_name as string]));
  const now = Date.now();

  return (
    <>
      <PageHeader title="Audit log" subtitle="The last 100 admin and security events." />
      <AuditList
        rows={(rows ?? []).map((r) => ({
          id: r.id as string | number,
          actor: r.actor_id ? (nameOf.get(r.actor_id) ?? 'removed user') : 'system',
          action: r.action as string,
          target: (r.target as string | null) ?? '',
          time: relTime(r.at, now),
          abs: absUtc(r.at),
        }))}
      />
    </>
  );
}
