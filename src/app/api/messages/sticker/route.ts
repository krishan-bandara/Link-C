import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, requireConversation, requireUser } from '@/lib/auth';
import { canViewSticker } from '@/lib/assets';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

const body = z.object({ conversationId: z.string().uuid(), stickerId: z.string().uuid() });

export const POST = handle(async (req: Request) => {
  const { user, supabase } = await requireUser();
  const b = body.parse(await req.json());
  if (!rateLimit(`stickermsg:${user.id}`, 60, 60_000)) throw new HttpError(429, 'Slow down');
  await requireConversation(supabase, user.id, b.conversationId);
  if (!(await canViewSticker(user.id, b.stickerId, true))) throw new HttpError(404, 'Sticker not found');
  const { data, error } = await adminClient()
    .from('messages')
    .insert({ conversation_id: b.conversationId, sender_id: user.id, type: 'sticker', body: '', sticker_id: b.stickerId })
    .select('id')
    .single();
  if (error || !data) throw new Error('message insert failed');
  return NextResponse.json({ messageId: data.id });
});
