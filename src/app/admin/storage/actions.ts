'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit, HttpError, requireOwner } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

type State = { ok?: boolean; message?: string } | null;

const schema = z.object({
  disk_free_alert_pct: z.coerce.number().int().min(1).max(90),
  b2_budget_gb: z.coerce.number().int().min(1).max(100000),
  b2_alert_pct: z.coerce.number().int().min(10).max(99),
});

const LABEL: Record<string, string> = {
  disk_free_alert_pct: 'Disk alert (1 to 90 percent free)',
  b2_budget_gb: 'Backblaze budget (1 to 100000 GB)',
  b2_alert_pct: 'Backblaze alert (10 to 99 percent)',
};

export async function saveStorageAlerts(_prev: State, fd: FormData): Promise<State> {
  try {
    const { user } = await requireOwner();
    const parsed = schema.safeParse(Object.fromEntries(Object.keys(schema.shape).map((k) => [k, fd.get(k)])));
    if (!parsed.success) return { ok: false, message: `${LABEL[String(parsed.error.issues[0]?.path[0])] ?? 'A value'} is out of range.` };
    const { error } = await adminClient().from('app_settings').update(parsed.data).eq('id', 1);
    if (error) return { ok: false, message: 'Could not save the storage alert settings' };
    await audit(user.id, 'storage_alerts_changed');
    revalidatePath('/admin/storage');
    revalidatePath('/admin');
    return { ok: true, message: 'Storage alert settings saved.' };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, message: e.status === 403 ? 'Owner only' : 'Please sign in again' };
    console.error('storage action error', e instanceof Error ? e.message : 'unknown');
    return { ok: false, message: 'Something went wrong' };
  }
}
