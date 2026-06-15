import { describe, expect, it } from "vitest";
import type { SlotAttendance, TimetableSlot } from "./schemas";
import {
  computeLessonDisplayStatus,
  getLessonsForDate,
  selectedDateLabel,
} from "./lessonStatus";

const slots: TimetableSlot[] = [
  {
    id: "mon-2",
    dayOfWeek: 1,
    period: 2,
    grade: 2,
    classNo: "1",
    subjectName: "문학",
    neisSubjectLabel: "문학",
  },
  {
    id: "tue-1",
    dayOfWeek: 2,
    period: 1,
    grade: 1,
    classNo: "3",
    subjectName: "독서",
    neisSubjectLabel: "독서",
  },
  {
    id: "mon-1",
    dayOfWeek: 1,
    period: 1,
    grade: 2,
    classNo: "2",
    subjectName: "문학",
    neisSubjectLabel: "문학",
  },
];

function attendance(overrides: Partial<SlotAttendance> = {}): SlotAttendance {
  return {
    absences: [],
    checkedAt: "2026-05-04T10:55:00+09:00",
    source: "mobile",
    syncedToNeis: false,
    closedOnNeis: false,
    ...overrides,
  };
}

describe("mobile lesson status helpers", () => {
  it("formats the selected date for Korean mobile UI", () => {
    expect(selectedDateLabel("2026-05-04")).toBe("5월 4일 월요일");
    expect(selectedDateLabel("2026-05-10")).toBe("5월 10일 일요일");
  });

  it("rejects impossible ISO calendar dates", () => {
    expect(() => selectedDateLabel("2026-02-31")).toThrow("Invalid ISO date");
    expect(() => getLessonsForDate(slots, "2026-13-01")).toThrow("Invalid ISO date");
  });

  it("computes lessons for a date by ISO weekday and sorts them by period", () => {
    expect(getLessonsForDate(slots, "2026-05-04").map((slot) => slot.id)).toEqual(["mon-1", "mon-2"]);
    expect(getLessonsForDate(slots, "2026-05-05").map((slot) => slot.id)).toEqual(["tue-1"]);
    expect(getLessonsForDate(slots, "2026-05-09")).toEqual([]);
  });

  it("returns unchecked when no attendance exists", () => {
    expect(computeLessonDisplayStatus()).toEqual({
      kind: "unchecked",
      checked: false,
      compactLabel: "미체크",
      summaryText: "아직 출결을 확인하지 않았습니다.",
      absenceCount: 0,
    });
  });

  it("returns allPresent for checked slots without exceptions", () => {
    expect(computeLessonDisplayStatus(attendance()).kind).toBe("allPresent");
    expect(computeLessonDisplayStatus(attendance()).compactLabel).toBe("전원 출석");
  });

  it("summarizes exception details in student-number order", () => {
    const status = computeLessonDisplayStatus(
      attendance({
        absences: [
          { studentNumber: 12, markType: "excused", note: "" },
          { studentNumber: 3, markType: "absent", note: "" },
        ],
      }),
    );

    expect(status.kind).toBe("exceptions");
    expect(status.absenceCount).toBe(2);
    expect(status.summaryText).toBe("3번 결과, 12번 출석인정");
    expect(status.compactLabel).toBe("결과·출석인정 2명");
  });

  it("distinguishes Drive and NEIS sync metadata states", () => {
    expect(computeLessonDisplayStatus(attendance(), { drivePending: true }).kind).toBe("drivePending");
    expect(computeLessonDisplayStatus(attendance(), { driveSynced: true }).kind).toBe("driveSynced");
    expect(computeLessonDisplayStatus(attendance(), { driveError: "network" }).kind).toBe("driveFailed");
    expect(computeLessonDisplayStatus(attendance({ syncedToNeis: true })).kind).toBe("neisSynced");
  });
});
