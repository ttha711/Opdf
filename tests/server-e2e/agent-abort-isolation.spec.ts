import { expect, test } from "@playwright/test";
import { raceAbort } from "../../apps/web/src/agent/raceAbort";

test("cancelled model response cannot resume a stopped job", async () => {
  const controller = new AbortController();
  let resolve!: (value: string) => void;
  const remote = new Promise<string>((done) => { resolve = done; });
  const awaiting = raceAbort(remote, controller.signal);
  controller.abort();
  await expect(awaiting).rejects.toMatchObject({ name: "AbortError" });
  resolve("late model command");
  await Promise.resolve();
});

test("one task cancellation does not cancel another", async () => {
  const first = new AbortController();
  const second = new AbortController();
  first.abort();
  await expect(raceAbort(Promise.resolve("first"), first.signal)).rejects.toMatchObject({ name: "AbortError" });
  await expect(raceAbort(Promise.resolve("second"), second.signal)).resolves.toBe("second");
});
