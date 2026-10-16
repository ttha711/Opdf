import { getNativeEditRevisionKey, setNativeEditRevisionKey } from "../native-edit/revisionKey";

const DB_NAME = "TpdfNativeEditHistory";
const DB_VERSION = 1;
const SESSIONS = "sessions";
const LARGE_REVISION_BYTES = 128 * 1024 * 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type NativeHistoryEntry =
  | { kind: "memory"; bytes: Uint8Array; byteLength: number; revisionKey: string; storageError?: string }
  | { kind: "stored"; id: string; byteLength: number; revisionKey: string };

export const NATIVE_HISTORY_LARGE_REVISION_BYTES = LARGE_REVISION_BYTES;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser history storage failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = (event) => {
      const requestError = (event.target as IDBRequest | null)?.error;
      reject(requestError ?? transaction.error ?? new Error("Browser history storage failed."));
    };
    transaction.onabort = (event) => {
      const requestError = (event.target as IDBRequest | null)?.error;
      reject(requestError ?? transaction.error ?? new Error("Browser history storage was aborted."));
    };
  });
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SESSIONS)) request.result.createObjectStore(SESSIONS);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error("Browser history storage is unavailable."));
      request.onblocked = () => reject(new Error("Browser history storage is blocked by another tab."));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function removeExpiredSessions(database: IDBDatabase, directory: FileSystemDirectoryHandle) {
  const read = database.transaction(SESSIONS, "readonly");
  const readDone = transactionDone(read);
  const store = read.objectStore(SESSIONS);
  const [ids, timestamps] = await Promise.all([
    requestResult(store.getAllKeys() as IDBRequest<string[]>),
    requestResult(store.getAll() as IDBRequest<number[]>),
  ]);
  await readDone;
  const expired = ids.filter((_, index) => Date.now() - timestamps[index] > SESSION_TTL_MS);
  if (!expired.length) return;

  const names: string[] = [];
  for await (const [name] of directory.entries()) names.push(name);
  for (const id of expired) {
    for (const name of names) {
      if (name.startsWith(`${id}--`)) await directory.removeEntry(name).catch(() => {});
    }
  }
  const write = database.transaction(SESSIONS, "readwrite");
  const done = transactionDone(write);
  for (const id of expired) {
    write.objectStore(SESSIONS).delete(id);
  }
  await done;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createNativeHistoryStore() {
  const sessionId = createId();
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  async function touchSession() {
    const database = await openDatabase();
    const transaction = database.transaction(SESSIONS, "readwrite");
    transaction.objectStore(SESSIONS).put(Date.now(), sessionId);
    await transactionDone(transaction);
  }

  async function save(bytes: Uint8Array): Promise<NativeHistoryEntry> {
    const revisionKey = getNativeEditRevisionKey(bytes.buffer as ArrayBuffer);
    if (bytes.byteLength <= LARGE_REVISION_BYTES) {
      return { kind: "memory", bytes, byteLength: bytes.byteLength, revisionKey };
    }
    try {
      const database = await openDatabase();
      const directory = await navigator.storage.getDirectory();
      await removeExpiredSessions(database, directory);
      const id = `${sessionId}--${createId()}`;
      await touchSession();
      const file = await directory.getFileHandle(id, { create: true });
      const writer = await file.createWritable();
      try {
        for (let offset = 0; offset < bytes.byteLength; offset += 16 * 1024 * 1024) {
          const chunk = bytes.slice(offset, offset + 16 * 1024 * 1024);
          await writer.write(chunk.buffer as ArrayBuffer);
        }
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => {});
        await directory.removeEntry(id).catch(() => {});
        throw error;
      }
      if (!heartbeat) heartbeat = setInterval(() => { void touchSession().catch(() => {}); }, 60_000);
      return { kind: "stored", id, byteLength: bytes.byteLength, revisionKey };
    } catch (error) {
      const storageError = error instanceof Error ? error.name : "StorageError";
      console.warn("[tpdf:native-edit-history] Falling back to in-memory history:", error);
      return { kind: "memory", bytes, byteLength: bytes.byteLength, revisionKey, storageError };
    }
  }

  async function load(entry: NativeHistoryEntry) {
    if (entry.kind === "memory") return entry.bytes;
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle(entry.id);
    const file = await handle.getFile();
    if (file.size !== entry.byteLength) throw new Error("Undo history is incomplete in browser storage.");
    const result = new Uint8Array(entry.byteLength);
    let offset = 0;
    const reader = file.stream().getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result.set(value, offset);
        offset += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    if (offset !== entry.byteLength) throw new Error("Undo history is incomplete in browser storage.");
    setNativeEditRevisionKey(result.buffer as ArrayBuffer, entry.revisionKey);
    return result;
  }

  async function remove(entry: NativeHistoryEntry) {
    if (entry.kind !== "stored") return;
    try {
      const directory = await navigator.storage.getDirectory();
      await directory.removeEntry(entry.id);
    } catch {
      // Expired session cleanup removes orphaned entries if storage is unavailable here.
    }
  }

  async function removeMany(entries: NativeHistoryEntry[]) {
    await Promise.all(entries.map(remove));
  }

  async function dispose() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    try {
      const database = await openDatabase();
      const directory = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const [name] of directory.entries()) {
        if (name.startsWith(`${sessionId}--`)) names.push(name);
      }
      await Promise.all(names.map((name) => directory.removeEntry(name).catch(() => {})));
      const transaction = database.transaction(SESSIONS, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(SESSIONS).delete(sessionId);
      await done;
    } catch {
      // The stale-session cleanup is a fallback for interrupted page shutdowns.
    }
  }

  return { save, load, removeMany, dispose };
}
