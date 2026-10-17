import { expect, test } from "@playwright/test";
import { enqueueAbortable } from "../../apps/web/src/agent/enqueueAbortable";
import { createUiAgentHarness } from "../../apps/web/src/components/uiAgentHarness";

test("command cancelled in queue never reaches PDF engine", async () => {
  const order: string[] = [];
  let release!: () => void;
  const first = new Promise<void>((resolve) => { release = resolve; });
  const stopped = new AbortController();
  const running = enqueueAbortable(
    Promise.resolve(), undefined,
    async () => { order.push("first"); await first; return "one"; },
    () => "cancelled",
  );
  const cancelled = enqueueAbortable(
    running.tail, stopped.signal,
    async () => { order.push("should-not-run"); return "two"; },
    () => "cancelled",
  );
  const other = enqueueAbortable(
    cancelled.tail, undefined,
    async () => { order.push("third"); return "three"; },
    () => "cancelled",
  );
  stopped.abort();
  release();
  expect(await running.result).toBe("one");
  expect(await cancelled.result).toBe("cancelled");
  expect(await other.result).toBe("three");
  expect(order).toEqual(["first", "third"]);
});

test("job AbortSignal is forwarded to remote model bridge", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const controller = new AbortController();
  let forwarded: AbortSignal | undefined;
  let markCalled!: () => void;
  const called = new Promise<void>((resolve) => { markCalled = resolve; });
  let executed = false;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { tpdfAgent: {
      getState: () => ({ hasDocument: true }),
      listTools: () => [],
    } },
  });
  try {
    const agent = createUiAgentHarness({
      machineBridge: {
        sendQuery: async (_prompt, _context, signal) => {
          forwarded = signal;
          markCalled();
          return new Promise<never>(() => {});
        },
      },
      execute: async () => { executed = true; return null; },
      onProgress: () => {},
    });
    const task = agent.run("Review document", undefined, undefined, undefined, controller.signal);
    await called;
    expect(forwarded).toBe(controller.signal);
    controller.abort();
    const result = await task;
    expect(result.status).toBe("failed");
    expect(executed).toBe(false);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
