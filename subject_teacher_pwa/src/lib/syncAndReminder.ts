import { pendingItems, type SaveQueueItem } from "./offlineQueue";

export type DriveSyncLabel = "대기" | "완료" | "실패";

export interface DriveSyncLabelState {
  isOnline: boolean;
  queue: SaveQueueItem[];
  hasSyncError?: boolean;
}

export function deriveDriveSyncLabel(state: DriveSyncLabelState): DriveSyncLabel {
  if (state.hasSyncError) return "실패";
  if (!state.isOnline || pendingItems(state.queue).length > 0) return "대기";
  return "완료";
}

export function isUncheckedReminderDue(
  now: Date,
  reminderTime: string,
  uncheckedLessonCount: number,
): boolean {
  if (uncheckedLessonCount <= 0) return false;

  const reminderMinute = parseHourMinute(reminderTime);
  if (reminderMinute === null) return false;

  const currentMinute = now.getHours() * 60 + now.getMinutes();
  return currentMinute >= reminderMinute;
}

export function buildUncheckedReminderMessage(uncheckedLessonCount: number): string {
  return `아직 출결 확인이 안 된 수업이 ${uncheckedLessonCount}개 있어요.`;
}

function parseHourMinute(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
