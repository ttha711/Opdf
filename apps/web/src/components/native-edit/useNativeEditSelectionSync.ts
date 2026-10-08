import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { registerNativeEditSelectionListener } from "../../lib/nativeEditRuntime";

type Props = {
  pageIndex: number;
  selectedId: string | null;
  editingText: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  commitInlineText: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useNativeEditSelectionSync({
  pageIndex, selectedId, editingText, setSelectedId, commitInlineText, setError,
}: Props) {
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
