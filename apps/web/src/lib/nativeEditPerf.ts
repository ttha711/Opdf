/** Opt-in timings for investigating large native PDF edits without logging document content. */
export function recordNativeEditTiming(stage: string, startedAt: number, bytes?: number) {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("tpdf-perf") !== "1") return;
  const elapsedMs = Math.round((performance.now() - startedAt) * 10) / 10;
  console.info("TPDF_NATIVE_EDIT_TIMING=" + JSON.stringify({
    stage, elapsedMs, sizeMiB: bytes === undefined ? undefined : Math.round(bytes / 1048576),
  }));
}
