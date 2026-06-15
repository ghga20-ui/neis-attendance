import { describe, expect, it } from "vitest";
import {
  createEmptyMarks,
  cycleMark,
  marksToSlotAttendance,
  summarizeLesson,
} from "./attendance";

describe("mobile attendance draft helpers", () => {
  it("creates present marks for every roster student", () => {
    const marks = createEmptyMarks([
      { number: 1, name: "김가" },
      { number: 2, name: "이가" },
    ]);

    expect(marks).toEqual({ 1: "present", 2: "present" });
  });

  it("cycles present to absent to excused to present", () => {
    expect(cycleMark("present")).toBe("absent");
    expect(cycleMark("absent")).toBe("excused");
    expect(cycleMark("excused")).toBe("present");
  });

  it("serializes only non-present marks into SlotAttendance", () => {
    const slot = marksToSlotAttendance({ 1: "present", 2: "absent", 3: "excused" }, "2026-05-04T10:55:00+09:00");

    expect(slot.source).toBe("mobile");
    expect(slot.syncedToNeis).toBe(false);
    expect(slot.closedOnNeis).toBe(false);
    expect(slot.absences).toEqual([
      { studentNumber: 2, markType: "absent", note: "" },
      { studentNumber: 3, markType: "excused", note: "" },
    ]);
  });

  it("summarizes checked lessons for the today list", () => {
    expect(summarizeLesson(undefined)).toEqual({ checked: false, label: "미체크", absenceCount: 0 });
    expect(summarizeLesson(marksToSlotAttendance({ 1: "present" }, "2026-05-04T10:55:00+09:00"))).toEqual({
      checked: true,
      label: "전원 출석",
      absenceCount: 0,
    });
    expect(summarizeLesson(marksToSlotAttendance({ 1: "absent", 2: "excused" }, "2026-05-04T10:55:00+09:00"))).toEqual({
      checked: true,
      label: "결과·출석인정 2명",
      absenceCount: 2,
    });
  });
});
