'use client';

// Keeps unfinished uploads in the phone's browser storage (IndexedDB) so an upload can continue after the app was
// closed or switched away. The file never leaves the device this way; the server already keeps the pieces it received.

export type PendingUpload = {
  uploadId: string;
  conversationId: string;
  mode: 'normal' | 'once' | 'timed';
  timerSeconds: number | null;
  replyTo: string | null;
  name: string;
  file: Blob;
  createdAt: number;
};

const DB = 'linkc-uploads';
const STORE = 'pending';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'uploadId' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function savePending(p: PendingUpload): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(p));
  } catch {
    /* private mode or storage full: the upload still works, it just cannot resume */
  }
}

export async function removePending(uploadId: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(uploadId));
  } catch {
    /* ignore */
  }
}

export async function listPending(conversationId: string): Promise<PendingUpload[]> {
  try {
    const all = await run<PendingUpload[]>('readonly', (s) => s.getAll());
    const dayAgo = Date.now() - 24 * 3600_000;
    return all.filter((p) => p.conversationId === conversationId && p.createdAt > dayAgo);
  } catch {
    return [];
  }
}
