/** Execute serialized tool calls, skipping a command that was stopped while waiting. */
export function enqueueAbortable<T>(
  tail: Promise<void>,
  signal: AbortSignal | undefined,
  execute: () => Promise<T>,
  cancelled: () => T,
): { result: Promise<T>; tail: Promise<void> } {
  const result = tail.then(() => signal?.aborted ? cancelled() : execute());
  return {
    result,
    tail: result.then(() => undefined, () => undefined),
  };
}
