// IndexedDB persistence for the offline save queue.
//
// The queue must survive page refresh, tab close, and offline periods so that
// attendance typed without a network connection is never lost. All functions
// degrade to a no-op when IndexedDB is unavailable (e.g. jsdom in tests), so
// callers can use them unconditionally.

import type { SaveQueueItem } from "./offlineQueue";

const DB_NAME = "neis-subject";
const STORE = "saveQueue";
const VERSION = 1;

function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Load the persisted queue. Returns [] when storage is empty or unavailable. */
export async function loadQueue(): Promise<SaveQueueItem[]> {
  if (!hasIndexedDB()) return [];
  const db = await openDb();
  try {
    return await new Promise<SaveQueueItem[]>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as SaveQueueItem[]) ?? []);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Replace the persisted queue with `items`. No-op when storage is unavailable. */
export async function persistQueue(items: SaveQueueItem[]): Promise<void> {
  if (!hasIndexedDB()) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.clear();
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
