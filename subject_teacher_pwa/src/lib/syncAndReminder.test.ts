import { describe, expect, it } from "vitest";
import type { SaveQueueItem } from "./offlineQueue";
import {
  buildUncheckedReminderMessage,
  deriveDriveSyncLabel,
  isUncheckedReminderDue,
} from "./syncAndReminder";

function queueItem(status: SaveQueueItem["status"]): SaveQueueItem {
  return {
    id: `item-${status}`,
    date: "2026-05-04",
    slotId: "mon-3",
    payload: {
      absences: [],
      checkedAt: "2026-05-04T10:55:00+09:00",
      source: "mobile",
      syncedToNeis: false,
      closedOnNeis: false,
    },
    status,
    createdAt: "2026-05-04T10:55:00+09:00",
  };
}

describe("Drive sync labels", () => {
  it("shows pending when offline or local saves are waiting", () => {
    expect(deriveDriveSyncLabel({ isOnline: false, queue: [] })).toBe("대기");
    expect(deriveDriveSyncLabel({ isOnline: true, queue: [queueItem("pending")] })).toBe("대기");
  });

  it("shows complete when online with no pending saves", () => {
    expect(deriveDriveSyncLabel({ isOnline: true, queue: [] })).toBe("완료");
    expect(deriveDriveSyncLabel({ isOnline: true, queue: [queueItem("synced")] })).toBe("완료");
  });

  it("shows failed when the latest sync attempt failed", () => {
    expect(deriveDriveSyncLabel({ isOnline: true, queue: [queueItem("pending")], hasSyncError: true })).toBe("실패");
  });
});

describe("unchecked lesson reminders", () => {
  it("is due only after the configured HH:mm time when unchecked lessons remain", () => {
    expect(isUncheckedReminderDue(new Date("2026-05-04T15:29:00+09:00"), "15:30", 2)).toBe(false);
    expect(isUncheckedReminderDue(new Date("2026-05-04T15:30:00+09:00"), "15:30", 2)).toBe(true);
    expect(isUncheckedReminderDue(new Date("2026-05-04T16:00:00+09:00"), "15:30", 2)).toBe(true);
  });

  it("is not due when every lesson has been checked", () => {
    expect(isUncheckedReminderDue(new Date("2026-05-04T16:00:00+09:00"), "15:30", 0)).toBe(false);
  });

  it("builds a readable Korean message with the unchecked lesson count", () => {
    expect(buildUncheckedReminderMessage(3)).toBe("아직 출결 확인이 안 된 수업이 3개 있어요.");
  });
});
