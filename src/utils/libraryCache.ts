import type { LibraryEntry } from './fileSystemAccess';

/**
 * Persists the picked library folder's handle and its scanned metadata index in IndexedDB, so a
 * return visit can restore the full song list instantly instead of re-walking a folder that may
 * contain thousands of entries. `FileSystemDirectoryHandle` (and the per-entry handles nested
 * inside `LibraryEntry`) are structured-cloneable, so they persist directly alongside the plain
 * metadata - no separate serialization needed.
 */

const DB_NAME = 'clone-hero-chart-analyzer';
const DB_VERSION = 1;
const STORE_NAME = 'library';
const RECORD_KEY = 'main';

export interface CachedLibrary {
  rootHandle: FileSystemDirectoryHandle;
  entries: LibraryEntry[];
  scannedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadCachedLibrary(): Promise<CachedLibrary | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      req.onsuccess = () => resolve((req.result as CachedLibrary | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveCachedLibrary(rootHandle: FileSystemDirectoryHandle, entries: LibraryEntry[]): Promise<void> {
  try {
    const db = await openDb();
    const record: CachedLibrary = { rootHandle, entries, scannedAt: Date.now() };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Caching is a convenience, not a requirement - a failure here (e.g. private browsing,
    // storage quota) just means the next visit re-scans instead of restoring instantly.
  }
}

export async function clearCachedLibrary(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Nothing to clean up if the store was never usable.
  }
}
