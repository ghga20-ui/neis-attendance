import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { loadQueue, persistQueue } from "./db";
import type { SaveQueueItem } from "./offlineQueue";

function item(overrides: Partial<SaveQueueItem> = {}): SaveQueueItem {
  return {
    id: "2026-05-04:mon-3:1",
    date: "2026-05-04",
    slotId: "mon-3",
    payload: {
      absences: [{ studentNumber: 3, markType: "absent", note: "" }],
      checkedAt: "2026-05-04T10:55:00+09:00",
      source: "mobile",
      syncedToNeis: false,
      closedOnNeis: false,
    },
    status: "pending",
    createdAt: "2026-05-04T10:55:00+09:00",
    ...overrides,
  };
}

describe("offline queue persistence", () => {
  beforeEach(() => {
    // Fresh in-memory IndexedDB per test.
    globalThis.indexedDB = new IDBFactory();
  });

  it("returns an empty queue before anything is saved", async () => {
    expect(await loadQueue()).toEqual([]);
  });

  it("round-trips queue items through IndexedDB", async () => {
    const items = [item(), item({ id: "2026-05-04:mon-6:2", slotId: "mon-6", status: "failed" })];
    await persistQueue(items);

    const loaded = await loadQueue();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((entry) => entry.slotId).sort()).toEqual(["mon-3", "mon-6"]);
    expect(loaded.find((entry) => entry.slotId === "mon-6")?.status).toBe("failed");
  });

  it("replaces the stored queue on each persist", async () => {
    await persistQueue([item()]);
    await persistQueue([item({ id: "2026-05-04:mon-3:1", status: "synced" })]);

    const loaded = await loadQueue();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].status).toBe("synced");
  });
});
