import { describe, expect, it } from "vitest";
import {
  MonthlyAttendanceSchema,
  SettingsSchema,
  StudentsSchema,
  TimetableSchema,
} from "./schemas";

describe("Drive JSON schemas", () => {
  it("accepts the same camelCase settings shape as the desktop app", () => {
    const settings = SettingsSchema.parse({
      schemaVersion: 1,
      teacherName: "홍길동",
      schoolName: "나이스고",
      region: "경기",
      semester: { year: 2026, term: 1 },
      closeByDefault: false,
      updatedAt: "2026-05-04T09:00:00+09:00",
    });

    expect(settings.semester.year).toBe(2026);
    expect(settings.closeByDefault).toBe(false);
  });

  it("normalizes numeric timetable classNo to a string", () => {
    const timetable = TimetableSchema.parse({
      schemaVersion: 1,
      effectiveFrom: "2026-03-02",
      slots: [{
        id: "mon-1",
        dayOfWeek: 1,
        period: 3,
        grade: 2,
        classNo: 1,
        subjectName: "문학",
        neisSubjectLabel: "문학",
      }],
    });

    expect(timetable.slots[0].classNo).toBe("1");
  });

  it("rejects invalid class keys in students.json", () => {
    expect(() => StudentsSchema.parse({
      schemaVersion: 1,
      classes: {
        "two-one": [{ number: 1, name: "학생" }],
      },
    })).toThrow();
  });

  it("accepts monthly attendance records with mobile sync flags", () => {
    const monthly = MonthlyAttendanceSchema.parse({
      schemaVersion: 1,
      month: "2026-05",
      records: {
        "2026-05-04": {
          "mon-3": {
            absences: [{ studentNumber: 12, markType: "absent", note: "" }],
            checkedAt: "2026-05-04T10:55:00+09:00",
            source: "mobile",
            syncedToNeis: false,
            closedOnNeis: false,
          },
        },
      },
    });

    expect(monthly.records["2026-05-04"]["mon-3"].absences).toHaveLength(1);
  });
});
