
const DB_NAME = "OpdfWebStorage";
const STORE_NAME = "drafts";
const PDF_KEY = "current_pdf_bytes";
const STATE_KEY = "current_session_state";

export interface WebState {
  fileName: string;
  annotations: any[];
  thumbnails: Array<{ page: number; blob: Blob }>;
  page: number;
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

export async function savePdfBytes(bytes: Uint8Array) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(bytes, PDF_KEY);
  } catch (err) {
    console.error("Failed to save PDF bytes:", err);
  }
}

export async function saveWebState(state: WebState) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(state, STATE_KEY);
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
  } catch (err) {
    console.error("Failed to clear draft:", err);
  }
}
