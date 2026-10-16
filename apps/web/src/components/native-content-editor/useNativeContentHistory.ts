import { useCallback, useEffect, useRef, useState } from "react";
import {
  createNativeHistoryStore,
  NATIVE_HISTORY_LARGE_REVISION_BYTES,
  type NativeHistoryEntry,
} from "./historyStore";
import { trimNativeContentHistory } from "./history";

type Options = {
  enqueueMutation: <T>(operation: () => Promise<T>) => Promise<T>;
  getCurrentBytes: () => Uint8Array | null;
  getDocumentBytes: () => Promise<Uint8Array | null>;
  applyBytes: (bytes: Uint8Array) => void;
  inspectBytes: (bytes: Uint8Array) => Promise<void>;
  onMessage: (message: string) => void;
};

export function useNativeContentHistory(options: Options) {
  const [store] = useState(createNativeHistoryStore);
  const [undoStack, setUndoStack] = useState<NativeHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<NativeHistoryEntry[]>([]);
  const undoRef = useRef<NativeHistoryEntry[]>([]);
  const redoRef = useRef<NativeHistoryEntry[]>([]);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const updateUndo = useCallback((entries: NativeHistoryEntry[]) => {
    undoRef.current = entries;
    setUndoStack(entries);
  }, []);
  const updateRedo = useCallback((entries: NativeHistoryEntry[]) => {
    redoRef.current = entries;
    setRedoStack(entries);
  }, []);

  useEffect(() => () => { void store.dispose(); }, [store]);

  const recordAppliedRevision = useCallback(async (bytes: Uint8Array, maxBytes: number) => {
    const entry = await store.save(bytes);
    const nextUndo = trimNativeContentHistory([...undoRef.current, entry], maxBytes);
    const retained = new Set(nextUndo);
    const discarded = undoRef.current.filter((item) => !retained.has(item));
    await store.removeMany([...discarded, ...redoRef.current]);
    updateUndo(nextUndo);
    updateRedo([]);
    return {
      storedOnDisk: entry.kind === "stored",
      limited: bytes.byteLength > NATIVE_HISTORY_LARGE_REVISION_BYTES,
      storageError: entry.kind === "memory" ? entry.storageError : undefined,
    };
  }, [store, updateRedo, updateUndo]);

  const move = useCallback((from: "undo" | "redo") => optionsRef.current.enqueueMutation(async () => {
    const source = from === "undo" ? undoRef.current : redoRef.current;
    const entry = source.at(-1);
    if (!entry) return;
    const current = optionsRef.current.getCurrentBytes() ?? await optionsRef.current.getDocumentBytes();
    if (!current) return;

    const restored = await store.load(entry);
    const other = from === "undo" ? redoRef.current : undoRef.current;
    const currentEntry = await store.save(current);
    const nextOther = [...other.slice(-9), currentEntry];
    const removed = other.slice(0, Math.max(0, other.length - 9));
    if (from === "undo") {
      updateUndo(source.slice(0, -1));
      updateRedo(nextOther);
    } else {
      updateRedo(source.slice(0, -1));
      updateUndo(nextOther);
    }
    await store.removeMany([entry, ...removed]);
    optionsRef.current.applyBytes(restored);
    await optionsRef.current.inspectBytes(restored);
    const action = from === "undo" ? "Native content edit undone." : "Native content edit redone.";
    optionsRef.current.onMessage(currentEntry.kind === "memory" && currentEntry.storageError
      ? `${action} Large PDF history storage is unavailable; this revision is kept in memory.`
      : action);
  }), [store, updateRedo, updateUndo]);

  const undo = useCallback(() => move("undo"), [move]);
  const redo = useCallback(() => move("redo"), [move]);
  return { undoStack, redoStack, recordAppliedRevision, undo, redo };
}
