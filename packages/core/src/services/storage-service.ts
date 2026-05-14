import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RecentDocument, SessionSnapshot } from "../types/index.js";

interface StorageStore {
  recents: RecentDocument[];
  session: SessionSnapshot;
}

export class StorageService {
  constructor(private readonly basePath: string) {}

  private async ensureStorePath(): Promise<string> {
    const filePath = join(this.basePath, "storage.json");
    await mkdir(dirname(filePath), { recursive: true });
    return filePath;
  }

  private defaultStore(): StorageStore {
    return {
      recents: [],
      session: {
        activeFilePath: null,
        openTabs: [],
        activeTabIndex: 0,
        updatedAt: Date.now(),
      },
    };
  }

  private async readStore(): Promise<StorageStore> {
    const filePath = await this.ensureStorePath();
    try {
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as StorageStore;
    } catch {
      return this.defaultStore();
    }
  }

  private async writeStore(next: StorageStore): Promise<void> {
    const filePath = await this.ensureStorePath();
    await writeFile(filePath, JSON.stringify(next, null, 2), "utf-8");
  }

  async getRecent(limit = 20): Promise<RecentDocument[]> {
    const store = await this.readStore();
    return store.recents.slice(0, limit);
  }

  async pushRecent(filePath: string): Promise<void> {
    const store = await this.readStore();
    const nextRecents = [
      { filePath, openedAt: Date.now() },
      ...store.recents.filter((r) => r.filePath !== filePath),
    ].slice(0, 100);

    store.recents = nextRecents;
    await this.writeStore(store);
  }

  async restoreSession(): Promise<SessionSnapshot> {
    const store = await this.readStore();
    return store.session;
  }

  async writeSession(session: SessionSnapshot): Promise<void> {
    const store = await this.readStore();
    store.session = { ...session, updatedAt: Date.now() };
    await this.writeStore(store);
  }

  async writeTemp(name: string, bytes: Uint8Array): Promise<string> {
    const output = join(this.basePath, "temp", name);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes);
    return output;
  }

  async cleanup(): Promise<void> {
    const tempPath = join(this.basePath, "temp");
    await rm(tempPath, { recursive: true, force: true });
  }
}