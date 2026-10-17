/** Stop waiting for an obsolete model response without losing its rejection. */
export function raceAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  const abortError = () => Object.assign(new Error("Agent task cancelled."), { name: "AbortError" });
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { cleanUp(); reject(abortError()); };
    const cleanUp = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => { cleanUp(); resolve(value); },
      (error: unknown) => { cleanUp(); reject(error); },
    );
  });
}
