import { describe, expect, it, vi } from "vitest";
import { RemoteTileLoader } from "./remoteTileLoader";

type Pending = {
  url: string;
  signal: AbortSignal;
  resolve: (value: Response) => void;
};

function controlledFetcher() {
  const requests: Pending[] = [];
  const fetcher = vi.fn((url: string, options: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      const signal = options.signal as AbortSignal;
      signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }, { once: true });
      requests.push({ url, signal, resolve });
    });
  }) as unknown as typeof fetch;
  return { requests, fetcher };
}

describe("RemoteTileLoader", () => {
  it("prioritizes new visible tiles and cancels old requests before dispatch", async () => {
    const { requests, fetcher } = controlledFetcher();
    const errors: string[] = [];
    const loader = new RemoteTileLoader(() => {}, (value) => errors.push(value),
      { concurrency: 2, fetcher, createUrl: () => "blob:unused" });
    loader.update(["visible-a", "visible-b", "overscan-a", "overscan-b"]);
    expect(requests.map((item) => item.url)).toEqual(["visible-a", "visible-b"]);

    loader.update(["new-visible", "visible-b", "new-overscan"]);
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].signal.aborted).toBe(false);
    await vi.waitFor(() => {
      expect(requests.some((item) => item.url === "new-visible")).toBe(true);
    });
    expect(requests.some((item) => item.url === "overscan-a")).toBe(false);
    expect(requests.some((item) => item.url === "overscan-b")).toBe(false);
    expect(errors).toEqual([]);
    loader.close();
    expect(requests.find((item) => item.url === "new-visible")?.signal.aborted).toBe(true);
  });

  it("bounds concurrent network requests and revokes replaced object URLs", async () => {
    const { requests, fetcher } = controlledFetcher();
    const revoked: string[] = [];
    const errors: string[] = [];
    const loader = new RemoteTileLoader(() => {}, (message) => errors.push(message), {
      concurrency: 3, fetcher,
      createUrl: () => "blob:rendered",
      revokeUrl: (url) => revoked.push(url),
    });
    loader.update(Array.from({ length: 50 }, (_, i) => "tile-" + i));
    expect(requests).toHaveLength(3);

    requests[0].resolve({ ok: true, status: 200, blob: async () => new Blob(["t"]) } as Response);
    await vi.waitFor(() => expect(loader.get("tile-0")).toBe("blob:rendered"));
    await vi.waitFor(() => expect(requests).toHaveLength(4));
    loader.update(["tile-0"]);
    expect(requests.slice(1).every((item) => item.signal.aborted)).toBe(true);
    expect(loader.get("tile-0")).toBe("blob:rendered");
    loader.update([]);
    expect(revoked).toEqual(["blob:rendered"]);
    expect(errors).toEqual([]);
    loader.close();
  });
});
