// Viewport-first tile fetch queue. Fetch AbortControllers are retained until
// the request settles; replacing tile DOM nodes alone does not cancel HTTP GETs.
type TileEntry = {
  state: "queued" | "loading" | "ready" | "failed";
  controller?: AbortController;
  objectUrl?: string;
};

type LoaderOptions = {
  concurrency?: number;
  fetcher?: typeof fetch;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
};

export class RemoteTileLoader {
  private readonly entries = new Map<string, TileEntry>();
  private wanted: string[] = [];
  private inFlight = 0;
  private closed = false;
  private readonly concurrency: number;
  private readonly fetcher: typeof fetch;
  private readonly createUrl: (blob: Blob) => string;
  private readonly revokeUrl: (url: string) => void;

  constructor(
    private readonly onChange: () => void,
    private readonly onError: (message: string) => void,
    options: LoaderOptions = {},
  ) {
    this.concurrency = Math.max(1, Math.min(8, options.concurrency ?? 6));
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.createUrl = options.createUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeUrl = options.revokeUrl ?? ((url) => URL.revokeObjectURL(url));
  }

  get(sourceUrl: string): string | undefined {
    return this.entries.get(sourceUrl)?.objectUrl;
  }

  // URLs arrive viewport-first. Preserve already completed and still-relevant
  // requests; cancel all stale work immediately, including queued requests.
  update(sourceUrls: string[]) {
    if (this.closed) return;
    const wanted = new Set(sourceUrls);
    let removedImages = false;
    for (const [url, entry] of this.entries) {
      if (wanted.has(url)) continue;
      entry.controller?.abort();
      if (entry.objectUrl) {
        this.revokeUrl(entry.objectUrl);
        removedImages = true;
      }
      this.entries.delete(url);
    }
    this.wanted = [...wanted];
    for (const url of this.wanted) {
      if (!this.entries.has(url)) this.entries.set(url, { state: "queued" });
    }
    if (removedImages) this.onChange();
    this.pump();
  }

  private pump() {
    if (this.closed) return;
    while (this.inFlight < this.concurrency) {
      const url = this.wanted.find((candidate) => this.entries.get(candidate)?.state === "queued");
      if (!url) return;
      const entry = this.entries.get(url)!;
      entry.state = "loading";
      entry.controller = new AbortController();
      this.inFlight += 1;
      void this.load(url, entry);
    }
  }

  private async load(url: string, entry: TileEntry) {
    const signal = entry.controller!.signal;
    try {
      const response = await this.fetcher(url, { signal, cache: "no-store" });
      if (!response.ok) throw new Error(`Tile request failed (HTTP ${response.status}).`);
      const blob = await response.blob();
      if (signal.aborted || this.closed || this.entries.get(url) !== entry) return;
      const objectUrl = this.createUrl(blob);
      if (signal.aborted || this.closed || this.entries.get(url) !== entry) {
        this.revokeUrl(objectUrl);
        return;
      }
      entry.state = "ready";
      entry.objectUrl = objectUrl;
      entry.controller = undefined;
      this.onChange();
    } catch (error) {
      if (!signal.aborted && !this.closed && this.entries.get(url) === entry) {
        entry.state = "failed";
        this.onError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.inFlight -= 1;
      this.pump();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.entries.values()) {
      entry.controller?.abort();
      if (entry.objectUrl) this.revokeUrl(entry.objectUrl);
    }
    this.entries.clear();
    this.wanted = [];
  }
}
