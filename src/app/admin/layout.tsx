import type { ReactNode } from 'react';
import { adminClient } from '@/lib/supabase/admin';
import AdminShell from './AdminShell';
import './admin.css';
import { ownerOrRedirect } from './guard';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = await ownerOrRedirect();
  const { data } = await adminClient().from('profiles').select('display_name,avatar_asset_id').eq('id', user.id).single();
  return (
    <AdminShell owner={{ id: user.id, name: (data?.display_name as string | undefined) ?? 'Owner', avatarAssetId: (data?.avatar_asset_id as string | null | undefined) ?? null }}>
      {children}
    </AdminShell>
  );
}
