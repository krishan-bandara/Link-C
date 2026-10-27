import { shrinkImage } from './shrink';
import { removePending, savePending } from './pending-uploads';

export type UploadMode = 'normal' | 'once' | 'timed';
export type UploadOpts = { conversationId: string; mode: UploadMode; timerSeconds: number | null; replyTo?: string | null; hd?: boolean };
export type UploadProgress = { phase: 'uploading' | 'processing'; sent: number; total: number };

export class UploadError extends Error {}
class FatalUploadError extends UploadError {}

const PARALLEL = 3; // pieces sent at the same time

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

export type UploadHooks = {
  /** Called as soon as the server has accepted the upload (so it can be cancelled or resumed). */
  onCreated?: (uploadId: string) => void;
  /** Continue an upload that was started earlier. The file passed in must be the stored (already shrunk) one. */
  resume?: { uploadId: string };
};

/** Chunked, resumable upload. Resolves with the id of the created upload (== media id). */
export async function uploadFile(
  original: File | Blob,
  opts: UploadOpts,
  onProgress: (p: UploadProgress) => void,
  signal: AbortSignal,
  hooks: UploadHooks = {},
): Promise<{ uploadId: string }> {
  let uploadId = hooks.resume?.uploadId ?? '';
  try {
    return await runUpload(original, opts, onProgress, signal, hooks, (id) => (uploadId = id));
  } catch (e) {
    // A permanent failure cannot be resumed. Anything else (connection lost, app closed) keeps the stored file.
    if (uploadId && !signal.aborted && e instanceof FatalUploadError) void removePending(uploadId);
    throw e;
  }
}

async function runUpload(
  original: File | Blob,
  opts: UploadOpts,
  onProgress: (p: UploadProgress) => void,
  signal: AbortSignal,
  hooks: UploadHooks,
  setId: (id: string) => void,
): Promise<{ uploadId: string }> {
  const resuming = !!hooks.resume;
  const file = resuming ? original : await shrinkImage(original as File, opts.hd);
  let uploadId: string;
  let chunkSize: number;
  let totalChunks: number;
  let nothingToSend = false;
  const done = new Set<number>();

  if (resuming) {
    uploadId = hooks.resume!.uploadId;
    const first = await fetch(`/api/uploads/${uploadId}`, { signal });
    if (first.status === 404 || first.status === 410) throw new FatalUploadError('This upload expired. Please send it again.');
    const st = await json<{ status: string; received: number[]; totalChunks: number; chunkSize: number; error?: string }>(first);
    if (st.status === 'failed') throw new FatalUploadError(st.error ?? 'Upload failed');
    chunkSize = st.chunkSize;
    totalChunks = st.totalChunks;
    for (const i of st.received) done.add(i);
    nothingToSend = st.status !== 'uploading'; // already assembling or finished
    setId(uploadId);
    hooks.onCreated?.(uploadId);
  } else {
    const created = await json<{ uploadId: string; chunkSize: number; totalChunks: number }>(
      await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: opts.conversationId,
          mime: file.type,
          size: file.size,
          mode: opts.mode,
          timerSeconds: opts.mode === 'timed' ? opts.timerSeconds : null,
          replyTo: opts.replyTo ?? null,
        }),
        signal,
      }),
    );
    ({ uploadId, chunkSize, totalChunks } = created);
    setId(uploadId);
    hooks.onCreated?.(uploadId);
    await savePending({
      uploadId,
      conversationId: opts.conversationId,
      mode: opts.mode,
      timerSeconds: opts.mode === 'timed' ? opts.timerSeconds : null,
      replyTo: opts.replyTo ?? null,
      name: original instanceof File ? original.name : 'file',
      file,
      createdAt: Date.now(),
    });
  }

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

  const sendChunk = async (i: number) => {
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
        return;
      } catch (e) {
        if (signal.aborted) throw new UploadError('Cancelled');
        if (e instanceof FatalUploadError) throw e;
        if (++attempt >= 5) throw new UploadError('Upload paused. Check your connection: it continues when you open this chat again.');
        await sleep(Math.min(8000, 500 * 2 ** attempt), signal);
        try {
          await waitOnline(signal);
          await syncReceived();
        } catch {
          /* resync best effort */
        }
        if (done.has(i)) return;
      }
    }
  };

  const todo: number[] = [];
  if (!nothingToSend) for (let i = 0; i < totalChunks; i++) if (!done.has(i)) todo.push(i);
  let next = 0;
  let failure: unknown = null;
  const lane = async () => {
    while (!failure) {
      const i = todo[next++];
      if (i === undefined) return;
      try {
        await sendChunk(i);
      } catch (e) {
        failure = failure ?? e;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, lane));
  if (failure) throw failure;

  if (!nothingToSend) {
    const c = await fetch(`/api/uploads/${uploadId}/complete`, { method: 'POST', signal });
    if (c.status !== 202 && !c.ok) await json(c);
  }

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
    if (st.status === 'done') {
      void removePending(uploadId);
      return { uploadId };
    }
    if (st.status === 'failed') throw new FatalUploadError(st.error ?? 'Upload failed');
  }
}

/** Cancel on purpose: tells the server to drop the pieces and forgets the stored file. */
export async function cancelUploadOnServer(uploadId: string): Promise<void> {
  void removePending(uploadId);
  await fetch(`/api/uploads/${uploadId}`, { method: 'DELETE' }).catch(() => {});
}
