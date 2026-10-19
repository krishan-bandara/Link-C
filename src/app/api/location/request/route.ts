import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit, handle, requireConversation, requireOwner } from '@/lib/auth';
import { adminClient } from '@/lib/supabase/admin';

const Body = z.object({ conversationId: z.string().uuid() });

export const POST = handle(async (req: Request) => {
  const { user, supabase } = await requireOwner();
  const { conversationId } = Body.parse(await req.json().catch(() => ({})));
  const conv = await requireConversation(supabase, user.id, conversationId);
  const db = adminClient();

  const { data: existing } = await db
    .from('location_shares')
    .select('id,status')
    .eq('conversation_id', conversationId)
    .in('status', ['requested', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return NextResponse.json({ shareId: existing.id, status: existing.status });

  const { data, error } = await db
    .from('location_shares')
    .insert({ conversation_id: conversationId, requested_by: user.id, sharer_id: conv.otherId, status: 'requested' })
    .select('id,status')
    .single();
  if (error || !data) throw new Error('location insert failed');
  await audit(user.id, 'location_requested', data.id);
  return NextResponse.json({ shareId: data.id, status: data.status });
});
