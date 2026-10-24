// Thin IndexedDB wrapper. Every function resolves (never throws): where IndexedDB is missing or blocked
// (private mode, old browsers) the offline feature quietly does nothing.
// public/offline.js reads the same database: keep the names in sync.
export const DB_NAME = 'linkc-offline';
export const STORES = ['meta', 'convs', 'msgs', 'outbox'] as const;
export type Store = (typeof STORES)[number];

let dbp: Promise<IDBDatabase | null> | null = null;

export function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, s === 'outbox' ? { keyPath: 'id' } : undefined);
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            dbp = null;
          };
          resolve(db);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbp;
}

function run<T>(store: Store | Store[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest | null, db: IDBDatabase): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, mode);
      const req = fn(tx);
      let out: unknown = null;
      if (req) req.onsuccess = () => (out = req.result);
      tx.oncomplete = () => resolve(out as T);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function dbGet<T>(store: Store, key: string): Promise<T | null> {
  const db = await openDb();
  return db ? run<T>(store, 'readonly', (tx) => tx.objectStore(store).get(key), db) : null;
}

export async function dbAll<T>(store: Store): Promise<T[]> {
  const db = await openDb();
  return db ? ((await run<T[]>(store, 'readonly', (tx) => tx.objectStore(store).getAll(), db)) ?? []) : [];
}

export async function dbKeys(store: Store): Promise<string[]> {
  const db = await openDb();
  return db ? (((await run<IDBValidKey[]>(store, 'readonly', (tx) => tx.objectStore(store).getAllKeys(), db)) ?? []) as string[]) : [];
}

/** Resolves true when the write was committed. `key` is omitted for stores with an in-line key (outbox). */
export async function dbPut(store: Store, value: unknown, key?: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  // a successful put resolves with the key, never null
  const r = await run<unknown>(store, 'readwrite', (tx) => (key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key)), db);
  return r !== null;
}

export async function dbDelete(store: Store, key: string): Promise<void> {
  const db = await openDb();
  if (db) await run(store, 'readwrite', (tx) => tx.objectStore(store).delete(key), db);
}

/** Empties every store in one transaction. */
export async function dbClearAll(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await run<unknown>(
    [...STORES],
    'readwrite',
    (tx) => {
      for (const s of STORES) tx.objectStore(s).clear();
      return null;
    },
    db,
  );
}
