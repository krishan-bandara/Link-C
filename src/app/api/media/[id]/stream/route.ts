import { decryptRange, unwrapKey, verifyToken } from '@/lib/crypto';
import { handle, HttpError, requireUser } from '@/lib/auth';
import { downloadName } from '@/lib/assets';
import { deleteMediaBlobs, parseId } from '@/lib/media';
import { storeFor } from '@/lib/storage';
import { adminClient } from '@/lib/supabase/admin';

/** Single byte range. null = no/ignored header, 'bad' = unsatisfiable. */
function parseRange(h: string | null, size: number): { start: number; end: number } | null | 'bad' {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (m[1] === '' && m[2] === '')) return h.includes(',') ? null : 'bad';
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return 'bad';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'bad';
  return { start, end };
}

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { user, supabase } = await requireUser();
  const id = parseId((await params).id);

  // RLS: participants only
  const { data: item } = await supabase
    .from('media_items')
    .select('id,sender_id,mode,mime,kind,deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (!item) throw new HttpError(404, 'Not found');
  if (item.deleted_at) throw new HttpError(410, 'This media is no longer available');

  const snap = item.mode !== 'normal';
  if (snap) {
    const t = new URL(req.url).searchParams.get('t');
    const ok = t && verifyToken(t) === `${id}:${user.id}`;
    if (item.sender_id === user.id || !ok) throw new HttpError(403, 'Not allowed');
  }

  const { data: key } = await adminClient()
    .from('media_keys')
    .select('storage,object_key,wrapped_key,plaintext_size')
    .eq('media_id', id)
    .maybeSingle();
  if (!key) throw new HttpError(410, 'This media is no longer available');
  const size = Number(key.plaintext_size);

  const range = parseRange(req.headers.get('range'), size);
  const headers: Record<string, string> = {
    'Content-Type': item.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  };
  if (new URL(req.url).searchParams.get('download') === '1') {
    // View-once and timed media can never be saved.
    if (snap) throw new HttpError(403, 'Not allowed');
    headers['Content-Disposition'] = `attachment; filename="${downloadName(id, item.mime)}"`;
  }
  if (range === 'bad') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  }
  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  headers['Content-Length'] = String(end - start + 1);
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;

  const store = storeFor(key.storage as 'b2' | 'local', item.mode as 'normal' | 'once' | 'timed');
  const gen = decryptRange((s, e) => store.getRange(key.object_key, s, e), unwrapKey(key.wrapped_key), size, start, end);
  // View once means once: an image snap is burned after the first request, whether or not it used a Range header.
  const burnAfter = snap && item.kind === 'image';
  if (burnAfter) {
    // One-time image: claim it atomically so two parallel fetches cannot both succeed.
    const { data: claimed } = await adminClient()
      .from('media_items')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id');
    if (!claimed?.length) throw new HttpError(410, 'This media is no longer available');
  }
  const burn = () =>
    void deleteMediaBlobs(id).catch((e) => console.error('snap cleanup failed', e instanceof Error ? e.message : e));
  const onAbort = () => void gen.return(undefined);
  req.signal.addEventListener('abort', onAbort, { once: true });

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const r = await gen.next();
        if (r.done) {
          req.signal.removeEventListener('abort', onAbort);
          controller.close();
          if (burnAfter) burn();
        } else {
          controller.enqueue(new Uint8Array(r.value));
        }
      } catch (e) {
        controller.error(e);
        if (burnAfter) burn();
      }
    },
    cancel() {
      req.signal.removeEventListener('abort', onAbort);
      if (burnAfter) burn();
      return gen.return(undefined).then(() => undefined);
    },
  });
  return new Response(body, { status: range ? 206 : 200, headers });
});
