/** 极简 IndexedDB 封装（无第三方依赖，便于离线 PWA 与 Capacitor 打包） */

const DB_NAME = 'kotoba-jlpt';
const DB_VERSION = 1;

export const STORE = {
  progress: 'progress',
  settings: 'settings',
  daily: 'daily',
  cache: 'cache',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE.progress)) db.createObjectStore(STORE.progress, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE.settings)) db.createObjectStore(STORE.settings);
      if (!db.objectStoreNames.contains(STORE.daily)) db.createObjectStore(STORE.daily, { keyPath: 'date' });
      if (!db.objectStoreNames.contains(STORE.cache)) db.createObjectStore(STORE.cache);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

export async function idbPut(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  await tx(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)) as IDBRequest<IDBValidKey>);
}

export async function idbBulkPut(store: string, values: unknown[]): Promise<void> {
  if (!values.length) return;
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    for (const v of values) os.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(key) as unknown as IDBRequest<undefined>);
}

export async function idbClear(store: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.clear() as unknown as IDBRequest<undefined>);
}
