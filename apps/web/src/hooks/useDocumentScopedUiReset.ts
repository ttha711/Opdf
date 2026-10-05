import { useEffect, useRef } from "react";

export function useDocumentScopedUiReset(hasDocument: boolean, reset: () => void) {
  const previousHasDocumentRef = useRef(hasDocument);

  useEffect(() => {
    const hadDocument = previousHasDocumentRef.current;
    previousHasDocumentRef.current = hasDocument;
    if (hadDocument && !hasDocument) reset();
  }, [hasDocument, reset]);
}
