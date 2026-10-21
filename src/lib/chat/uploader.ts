import { shrinkImage } from './shrink';

export type UploadMode = 'normal' | 'once' | 'timed';
export type UploadOpts = { conversationId: string; mode: UploadMode; timerSeconds: number | null; replyTo?: string | null };
export type UploadProgress = { phase: 'uploading' | 'processing'; sent: number; total: number };

export class UploadError extends Error {}
class FatalUploadError extends UploadError {}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new UploadError('Cancelled'));
    });
  });

function waitOnline(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (navigator.onLine) return resolve();
    const on = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(new UploadError('Cancelled'));
    };
    const cleanup = () => {
      window.removeEventListener('online', on);
      signal?.removeEventListener('abort', abort);
    };
    window.addEventListener('online', on);
    signal?.addEventListener('abort', abort);
  });
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new UploadError((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Chunked, resumable upload. Resolves with the id of the created upload (== media id). */
export async function uploadFile(
  original: File,
  opts: UploadOpts,
  onProgress: (p: UploadProgress) => void,
  signal: AbortSignal,
): Promise<{ uploadId: string }> {
  const file = await shrinkImage(original);
  const created = await json<{ uploadId: string; chunkSize: number; totalChunks: number }>(
    await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        conversationId: opts.conversationId,
        mime: file.type,
        size: file.size,
        mode: opts.mode,
        replyTo: opts.replyTo ?? null,
        timerSeconds: opts.mode === 'timed' ? opts.timerSeconds : null,
      }),
      signal,
    }),
  );
  const { uploadId, chunkSize, totalChunks } = created;
  const done = new Set<number>();
  const report = () =>
    onProgress({
      phase: 'uploading',
      sent: Math.min(file.size, [...done].reduce((n, i) => n + Math.min(chunkSize, file.size - i * chunkSize), 0)),
      total: file.size,
    });
  report();

  const syncReceived = async () => {
    const st = await json<{ received: number[] }>(await fetch(`/api/uploads/${uploadId}`, { signal }));
    for (const i of st.received) done.add(i);
  };

  for (let i = 0; i < totalChunks; i++) {
    if (done.has(i)) continue;
    const blob = file.slice(i * chunkSize, Math.min(file.size, (i + 1) * chunkSize));
    let attempt = 0;
    for (;;) {
      if (signal.aborted) throw new UploadError('Cancelled');
      try {
        await waitOnline(signal);
        const res = await fetch(`/api/uploads/${uploadId}/chunk?i=${i}`, {
          method: 'PUT',
          body: blob,
          headers: { 'content-type': 'application/octet-stream' },
          signal,
        });
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          // Permanent rejection: surface the server's message, no retry.
          const d = await res.json().catch(() => ({}));
          throw new FatalUploadError((d as { error?: string }).error ?? `Request failed (${res.status})`);
        }
        const out = await json<{ received: number[] }>(res);
        for (const r of out.received) done.add(r);
        done.add(i);
        report();
        break;
      } catch (e) {
        if (signal.aborted) throw new UploadError('Cancelled');
        if (e instanceof FatalUploadError) throw e;
        if (++attempt >= 5) throw new UploadError('Upload failed. Check your connection and try again.');
        await sleep(Math.min(8000, 500 * 2 ** attempt), signal);
        try {
          await waitOnline(signal);
          await syncReceived();
        } catch {
          /* resync best effort */
        }
        if (done.has(i)) break;
      }
    }
  }

  const c = await fetch(`/api/uploads/${uploadId}/complete`, { method: 'POST', signal });
  if (c.status !== 202 && !c.ok) await json(c);

  onProgress({ phase: 'processing', sent: file.size, total: file.size });
  const started = Date.now();
  for (;;) {
    await sleep(1500, signal);
    if (Date.now() - started > 15 * 60_000) throw new UploadError('Processing is taking too long');
    let st: { status: string; error?: string };
    try {
      st = await json(await fetch(`/api/uploads/${uploadId}`, { signal }));
    } catch (e) {
      if (signal.aborted) throw new UploadError('Cancelled');
      if (e instanceof TypeError) continue; // transient network error
      throw e;
    }
    if (st.status === 'done') return { uploadId };
    if (st.status === 'failed') throw new UploadError(st.error ?? 'Upload failed');
  }
}
