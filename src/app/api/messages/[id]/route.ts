import { NextResponse } from 'next/server';
import { audit, handle, HttpError, requireUser } from '@/lib/auth';
import { deleteMediaBlobs, parseId } from '@/lib/media';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user, supabase } = await requireUser();
  const id = parseId((await params).id);
  if (!rateLimit(`msgdel:${user.id}`, 60, 60_000)) throw new HttpError(429, 'Too many requests');

  const { data: msg } = await supabase.from('messages').select('id,sender_id,type').eq('id', id).maybeSingle();
  if (!msg) throw new HttpError(404, 'Message not found');
  if (msg.type === 'system') throw new HttpError(403, 'System notices cannot be deleted');
  if (msg.sender_id !== user.id) throw new HttpError(403, 'Only the sender can delete a message');

  const db = adminClient();
  const { data: media } = await db.from('media_items').select('id').eq('message_id', id).maybeSingle();
  if (media) await deleteMediaBlobs(media.id as string);
  const { error } = await db.from('messages').delete().eq('id', id);
  if (error) throw new Error('delete failed');
  await audit(user.id, 'message_deleted', id);
  return NextResponse.json({ ok: true });
});
