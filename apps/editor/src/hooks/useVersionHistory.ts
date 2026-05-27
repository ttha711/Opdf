import { useState, useCallback } from "react";
import { AIParsedDocument, DocumentVersion } from "../types";

const STORAGE_KEY = "block_office_versions";
const MAX_VERSIONS = 30;

function loadVersions(): DocumentVersion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as DocumentVersion[];
  } catch { /* ignore */ }
  return [];
}

function saveVersions(versions: DocumentVersion[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
  } catch { /* quota exceeded – silently ignore */ }
}

export function useVersionHistory() {
  const [versions, setVersions] = useState<DocumentVersion[]>(loadVersions);

  /** Save a named snapshot of the current document */
  const saveVersion = useCallback((doc: AIParsedDocument, label?: string) => {
    const id = `v_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const autoLabel = label || `${doc.title} – ${new Date().toLocaleString("vi-VN")}`;

    const newVersion: DocumentVersion = {
      id,
      label: autoLabel,
      createdAt,
      snapshot: JSON.parse(JSON.stringify(doc)), // deep copy
    };

    setVersions(prev => {
      const updated = [newVersion, ...prev].slice(0, MAX_VERSIONS);
      saveVersions(updated);
      return updated;
    });

    return newVersion;
  }, []);

  /** Restore a version (returns the snapshot document) */
  const restoreVersion = useCallback((versionId: string): AIParsedDocument | null => {
    const found = loadVersions().find(v => v.id === versionId);
    if (!found) return null;
    return JSON.parse(JSON.stringify(found.snapshot));
  }, []);

  /** Rename a version */
  const renameVersion = useCallback((versionId: string, newLabel: string) => {
    setVersions(prev => {
      const updated = prev.map(v =>
        v.id === versionId ? { ...v, label: newLabel } : v
      );
      saveVersions(updated);
      return updated;
    });
  }, []);

  /** Delete a specific version */
  const deleteVersion = useCallback((versionId: string) => {
    setVersions(prev => {
      const updated = prev.filter(v => v.id !== versionId);
      saveVersions(updated);
      return updated;
    });
  }, []);

  /** Clear all versions */
  const clearAllVersions = useCallback(() => {
    setVersions([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  /** Auto-save a version (only if document has changed) */
  const autoSave = useCallback((doc: AIParsedDocument) => {
    const versions = loadVersions();
    // Only save if there's a difference from the last auto-save
    const lastVersion = versions[0];
    if (lastVersion) {
      const lastBlocks = JSON.stringify(lastVersion.snapshot.blocks);
      const currentBlocks = JSON.stringify(doc.blocks);
      if (lastBlocks === currentBlocks) return null; // No changes
    }

    const id = `auto_v_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const label = `${doc.title} – Tự động ${new Date().toLocaleString("vi-VN")}`;

    const newVersion: DocumentVersion = {
      id,
      label,
      createdAt,
      snapshot: JSON.parse(JSON.stringify(doc)),
    };

    setVersions(prev => {
      const updated = [newVersion, ...prev].slice(0, MAX_VERSIONS);
      saveVersions(updated);
      return updated;
    });

    return newVersion;
  }, []);

  /** Compare two versions - returns block diffs summary */
  const compareVersions = useCallback((versionId1: string, versionId2: string): { added: number; removed: number; modified: number } => {
    const v1 = loadVersions().find(v => v.id === versionId1);
    const v2 = loadVersions().find(v => v.id === versionId2);
    if (!v1 || !v2) return { added: 0, removed: 0, modified: 0 };

    const blocks1 = v1.snapshot.blocks;
    const blocks2 = v2.snapshot.blocks;

    let added = 0, removed = 0, modified = 0;

    const maxLen = Math.max(blocks1.length, blocks2.length);
    for (let i = 0; i < maxLen; i++) {
      const b1 = blocks1[i];
      const b2 = blocks2[i];
      if (!b1 && b2) added++;
      else if (b1 && !b2) removed++;
      else if (b1 && b2 && JSON.stringify(b1) !== JSON.stringify(b2)) modified++;
    }

    return { added, removed, modified };
  }, []);

  return {
    versions,
    saveVersion,
    restoreVersion,
    renameVersion,
    deleteVersion,
    clearAllVersions,
    autoSave,
    compareVersions,
  };
}