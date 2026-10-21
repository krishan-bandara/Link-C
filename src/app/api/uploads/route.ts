import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handle, HttpError, requireConversation, requireUser } from '@/lib/auth';
import { newFileKey, wrapKey } from '@/lib/crypto';
import { ALLOWED_MIMES, CHUNK_SIZE, kindOf } from '@/lib/media';
import { rateLimit } from '@/lib/rate-limit';
import { adminClient } from '@/lib/supabase/admin';

const Body = z.object({
  conversationId: z.string().uuid(),
  mime: z.string().max(100),
  size: z.number().int().positive(),
  mode: z.enum(['normal', 'once', 'timed']),
  timerSeconds: z.number().int().min(1).max(10).nullable().optional(),
  replyTo: z.string().uuid().nullable().optional(),
});

export const POST = handle(async (req: Request) => {
  const { user, supabase } = await requireUser();
  if (!rateLimit(`upl:${user.id}`, 30, 60_000)) throw new HttpError(429, 'Too many uploads, slow down');
  const b = Body.parse(await req.json().catch(() => ({})));
  if (b.mode === 'timed' && !b.timerSeconds) throw new HttpError(400, 'A timer is required for timed snaps');
  await requireConversation(supabase, user.id, b.conversationId);

  if (b.replyTo) {
    const { data: target } = await supabase.from('messages').select('id').eq('id', b.replyTo).eq('conversation_id', b.conversationId).maybeSingle();
    if (!target) throw new HttpError(400, 'The message you are replying to was not found');
  }

  if (!(ALLOWED_MIMES as readonly string[]).includes(b.mime)) {
    throw new HttpError(415, 'Only JPEG, PNG, WebP, GIF, MP4, MOV and WebM files are allowed');
  }
  const db = adminClient();
  const { data: st } = await db.from('app_settings').select('*').eq('id', 1).single();
  if (!st) throw new Error('settings missing');
  const maxMb = kindOf(b.mime) === 'image' ? st.photo_max_mb : st.video_max_mb;
  if (b.size > maxMb * 1024 * 1024) throw new HttpError(413, `File is too large (max ${maxMb} MB)`);

  const { data: active } = await db
    .from('upload_sessions')
    .select('user_id,total_size,status,created_at,last_chunk_at')
    .in('status', ['uploading', 'processing'])
    .gt('expires_at', new Date().toISOString());
  const rows = active ?? [];
  // An upload nobody has sent a piece to for 5 minutes was abandoned (app closed, phone slept): it must not block new ones.
  const staleBefore = Date.now() - 5 * 60_000;
  const live = (r: { status: string; created_at: string; last_chunk_at: string | null }) =>
    r.status === 'processing' || new Date(r.last_chunk_at ?? r.created_at).getTime() > staleBefore;
  if (rows.filter((r) => r.user_id === user.id && live(r)).length >= st.max_inflight_uploads) {
    throw new HttpError(429, 'Too many uploads in progress, please wait');
  }
  const used = rows.reduce((n, r) => n + Number(r.total_size), 0);
  if (used + b.size > st.temp_cap_mb * 1024 * 1024) {
    throw new HttpError(429, 'Server is busy with other uploads, try again shortly');
  }

  const totalChunks = Math.ceil(b.size / CHUNK_SIZE);
  const { data, error } = await db
    .from('upload_sessions')
    .insert({
      user_id: user.id,
      conversation_id: b.conversationId,
      mime: b.mime,
      total_size: b.size,
      chunk_size: CHUNK_SIZE,
      total_chunks: totalChunks,
      mode: b.mode,
      timer_seconds: b.mode === 'timed' ? (b.timerSeconds ?? null) : null,
      reply_to: b.replyTo ?? null,
      temp_key_wrapped: wrapKey(newFileKey()),
      expires_at: new Date(Date.now() + st.upload_ttl_minutes * 60_000).toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('could not create upload');
  return NextResponse.json({ uploadId: data.id, chunkSize: CHUNK_SIZE, totalChunks });
});
