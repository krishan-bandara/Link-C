import { NextResponse } from 'next/server';
import { audit, handle, HttpError, requireUser } from '@/lib/auth';
import { deleteMediaBlobs, parseId } from '@/lib/media';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user, supabase } = await requireUser();
  const id = parseId((await params).id);
  if (!rateLimit(`msgdel:${user.id}`, 60, 60_000)) throw new HttpError(429, 'Too many requests');

  const { data: msg } = await supabase.from('messages').select('id,sender_id,type,deleted_at').eq('id', id).maybeSingle();
  if (!msg) throw new HttpError(404, 'Message not found');
  if (msg.type === 'system') throw new HttpError(403, 'System notices cannot be deleted');
  if (msg.sender_id !== user.id) throw new HttpError(403, 'Only the sender can delete a message');

  const db = adminClient();
  if (!msg.deleted_at) {
    const { data: media, error: mErr } = await db.from('media_items').select('id').eq('message_id', id).maybeSingle();
    if (mErr) throw new Error('delete failed');
    // 1. erase the stored files (idempotent), 2. blank the message and keep it as a "deleted" notice, 3. drop reactions.
    // The row is kept (not removed) so both people see "This message was deleted", like WhatsApp.
    if (media) await deleteMediaBlobs(media.id as string);
    const { error } = await db
      .from('messages')
      .update({ body: '', sticker_id: null, deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('sender_id', user.id)
      .is('deleted_at', null);
    if (error) throw new Error('delete failed');
    await db.from('message_reactions').delete().eq('message_id', id);
  }
  await audit(user.id, 'message_deleted', id);
  return NextResponse.json({ ok: true });
});
