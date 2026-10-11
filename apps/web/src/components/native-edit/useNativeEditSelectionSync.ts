import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { registerNativeEditSelectionListener } from "../../lib/nativeEditRuntime";

type Props = {
  pageIndex: number;
  enabled: boolean;
  selectedId: string | null;
  editingText: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  commitInlineText: () => Promise<Uint8Array | null>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useNativeEditSelectionSync({
  pageIndex, enabled, selectedId, editingText, setSelectedId, commitInlineText, setError,
}: Props) {
  // A page may become inactive while its inline text draft is still open.
  // Commit before dropping the inactive page's selection and objects.
  useEffect(() => {
    if (enabled || editingText === null) return;
    void commitInlineText().catch((reason) =>
      setError(reason instanceof Error ? reason.message : String(reason)));
  }, [enabled, editingText, commitInlineText, setError]);
  useEffect(() => registerNativeEditSelectionListener((selection) => {
    const selectAfterCommit = () => setSelectedId(
      selection.pageIndex === pageIndex ? selection.objectId : null,
    );
    if (editingText !== null && (selection.pageIndex !== pageIndex || selection.objectId !== selectedId)) {
      void commitInlineText().then(selectAfterCommit).catch((reason) =>
        setError(reason instanceof Error ? reason.message : String(reason)));
    } else selectAfterCommit();
  }), [pageIndex, selectedId, editingText, commitInlineText, setError, setSelectedId]);
}
