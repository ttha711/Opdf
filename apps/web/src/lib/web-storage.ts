const DB_NAME = "OpdfWebStorage";
const STORE_NAME = "drafts";
const PDF_KEY = "current_pdf_bytes";
const STATE_KEY = "current_session_state";

export interface OpdfTab {
  id: string;
  fileName: string;
  docBytes: Uint8Array | null;
  page: number;
  totalPages: number;
  annotations: any[];
  bookmarks: Array<{ id: string; page: number; title: string; createdAt: number }>;
  group: string | null;
  groupColor: string | null;
  thumbnails?: Array<{ page: number; url: string; blob: Blob }>;
  pageRotations?: Record<number, number>;
}

export interface WebState {
  fileName: string;
  annotations: any[];
  thumbnails: Array<{ page: number; blob: Blob }>;
  page: number;
  bookmarks?: Array<{ id: string; page: number; title: string; createdAt: number }>;
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
    const safeTabs: OpdfTab[] = tabs.map((tab) => {
      let safeDocBytes: Uint8Array | null = null;
      if (tab.docBytes) {
        try {
          safeDocBytes = new Uint8Array(tab.docBytes);
        } catch {
          safeDocBytes = null;
        }
      }
      return {
        ...tab,
        docBytes: safeDocBytes,
      };
    });
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
      req.onsuccess = () => resolve(req.result || null);
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
  const buffer = await crypto.subtle.digest("SHA-256", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
