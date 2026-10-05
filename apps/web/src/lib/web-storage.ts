const DB_NAME = "OpdfWebStorage";
const STORE_NAME = "drafts";
const PDF_KEY = "current_pdf_bytes";
const STATE_KEY = "current_session_state";

export interface OpdfTab {
  id: string;
  fileName: string;
  docBytes: Uint8Array | null;
  sourceBlob?: Blob | null;
  sourceIdentity?: string;
  page: number;
  totalPages: number;
  annotations: any[];
  group: string | null;
  groupColor: string | null;
  pageRotations?: Record<number, number>;
}

export interface WebState {
  fileName: string;
  annotations: any[];
  page: number;
}

function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Returns true when the data was durably written, false on failure. */
export async function saveTabsList(tabs: OpdfTab[]): Promise<boolean> {
  try {
    // Persist only lightweight workspace metadata. Full PDF byte arrays and
    // viewer-derived state must stay out of
    // IndexedDB autosave. A future File System Access/OPFS source reference can
    // restore local documents without copying their bytes into app state.
    const safeTabs: OpdfTab[] = tabs.map((tab) => ({
      ...tab,
      docBytes: null,
      sourceBlob: null,
    }));
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(safeTabs, "opdf_tabs");
    await awaitTransaction(tx);
    return true;
  } catch (err) {
    console.error("Failed to save tabs list:", err);
    return false;
  }
}

export async function loadTabsList(): Promise<OpdfTab[] | null> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get("opdf_tabs");
    return new Promise((resolve) => {
      req.onsuccess = () => {
      const value = req.result as OpdfTab[] | undefined;
      // New sessions intentionally do not persist PDF bytes. Ignore lightweight
      // metadata-only tabs on reload instead of restoring broken empty tabs.
      const restorable = value?.filter((tab) => tab.docBytes && tab.docBytes.byteLength > 0) ?? [];
      resolve(restorable.length > 0 ? restorable : null);
    };
      tx.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error("Failed to load tabs list:", err);
    return null;
  }
}

export async function saveActiveTabId(id: string | null): Promise<boolean> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(id, "opdf_active_tab_id");
    await awaitTransaction(tx);
    return true;
  } catch (err) {
    console.error("Failed to save active tab ID:", err);
    return false;
  }
}

export async function loadActiveTabId(): Promise<string | null> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get("opdf_active_tab_id");
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      tx.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error("Failed to load active tab ID:", err);
    return null;
  }
}

export async function computeFileHash(bytes: Uint8Array): Promise<string> {
  // Identity only: do not copy/hash a 300-500 MB PDF on the UI thread.
  // Sample evenly across the document and include byteLength. This is stable
  // enough for local annotation lookup while keeping work bounded.
  let hash = 0x811c9dc5;
  const sampleCount = Math.min(4096, bytes.byteLength);
  const step = sampleCount > 0 ? Math.max(1, Math.floor(bytes.byteLength / sampleCount)) : 1;
  for (let i = 0, seen = 0; i < bytes.byteLength && seen < sampleCount; i += step, seen += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= bytes.byteLength;
  hash = Math.imul(hash, 16777619) >>> 0;
  return `sample-${bytes.byteLength}-${hash.toString(16).padStart(8, "0")}`;
}

export async function computeBlobHash(
  blob: Blob,
  name = "",
  lastModified = 0,
): Promise<string> {
  // Read only small slices from the beginning/middle/end. This gives stable
  // local annotation identity without materializing a 300-500 MB File.
  let hash = 0x811c9dc5;
  const sampleSize = 4096;
  const starts = [
    0,
    Math.max(0, Math.floor(blob.size / 2) - Math.floor(sampleSize / 2)),
    Math.max(0, blob.size - sampleSize),
  ];

  for (const start of starts) {
    const bytes = new Uint8Array(await blob.slice(start, Math.min(blob.size, start + sampleSize)).arrayBuffer());
    for (const value of bytes) {
      hash ^= value;
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  }

  for (const char of `${name}:${blob.size}:${lastModified}`) {
    hash ^= char.charCodeAt(0) & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `blob-${blob.size}-${lastModified}-${hash.toString(16).padStart(8, "0")}`;
}

export async function saveAnnotationsByHash(hash: string, annotations: unknown[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ annotations, savedAt: Date.now() }, `annot_${hash}`);
    await awaitTransaction(tx);
  } catch (err) {
    console.error("Failed to save annotations by hash:", err);
  }
}

export async function loadAnnotationsByHash(hash: string): Promise<unknown[] | null> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(`annot_${hash}`);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result?.annotations ?? null);
      tx.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function savePdfBytes(bytes: Uint8Array) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(bytes, PDF_KEY);
    await awaitTransaction(tx);
  } catch (err) {
    console.error("Failed to save PDF bytes:", err);
  }
}

export async function saveWebState(state: WebState) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(state, STATE_KEY);
    await awaitTransaction(tx);
  } catch (err) {
    console.error("Failed to save web state:", err);
  }
}

export async function loadFullDraft(): Promise<{ bytes: Uint8Array | null; state: WebState | null }> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const [bytesReq, stateReq] = [store.get(PDF_KEY), store.get(STATE_KEY)];
    
    return new Promise((resolve) => {
      let bytes: Uint8Array | null = null;
      let state: WebState | null = null;
      bytesReq.onsuccess = () => { bytes = bytesReq.result; };
      stateReq.onsuccess = () => { state = stateReq.result; };
      tx.oncomplete = () => resolve({ bytes, state });
      tx.onerror = () => resolve({ bytes: null, state: null });
    });
  } catch (err) {
    console.error("Failed to load full draft:", err);
    return { bytes: null, state: null };
  }
}

export async function clearDraft() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(PDF_KEY);
    tx.objectStore(STORE_NAME).delete(STATE_KEY);
    await awaitTransaction(tx);
  } catch (err) {
    console.error("Failed to clear draft:", err);
  }
}
