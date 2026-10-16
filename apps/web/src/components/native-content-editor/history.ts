export function trimNativeContentHistory(items: Uint8Array[], maxHistoryBytes: number) {
  const candidates = [...items];
  let total = candidates.reduce((sum, item) => sum + item.byteLength, 0);
  while (candidates.length > 10 || (candidates.length > 1 && total > maxHistoryBytes)) {
    total -= candidates[0].byteLength;
    candidates.shift();
  }
  return candidates;
}

export function createSerialMutationQueue() {
  let tail = Promise.resolve();
  return <T,>(operation: () => Promise<T>) => {
    const run = tail.then(operation, operation);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}
