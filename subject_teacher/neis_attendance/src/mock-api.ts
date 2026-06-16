import type { DesktopApi } from "./bridge";
import { ROSTERS, TIMETABLE, TODAY_SLOTS } from "./data";

const ok = (value: unknown): Promise<string> => Promise.resolve(JSON.stringify(value));

export function createMockApi(): DesktopApi {
  return {
    get_settings: () =>
      ok({
        schemaVersion: 1,
        teacherName: "Demo Teacher",
        schoolName: "Demo High School",
        region: "경기",
        semester: { year: 2026, term: 1 },
        closeByDefault: false,
        timetableMode: "manual",
        assignedLessons: [],
        updatedAt: "2026-03-02T09:00:00+09:00",
      }),
    save_settings: () => ok({ ok: true }),
    get_timetable_tsv: () =>
      Promise.resolve(
        `slot_id\tday\tperiod\tgrade\tclass_no\tsubject_name\tneis_subject_label\n${TIMETABLE.map((row) =>
          [
            row.id ?? "mon-1",
            row.day ?? "mon",
            row.period ?? 1,
            row.grade ?? 2,
            row.classNo ?? "1",
            row.subject ?? "Demo",
            row.neis ?? row.subject ?? "Demo",
          ].join("\t"),
        ).join("\n")}`,
      ),
    save_timetable_tsv: () => ok({ ok: true }),
    get_students_tsv: () =>
      Promise.resolve(
        Object.entries(ROSTERS)
          .flatMap(([classKey, students]) => students.map((student) => [classKey, student.n, student.name].join("\t")))
          .join("\n"),
      ),
    save_students_tsv: () => ok({ ok: true }),
    get_today_slots: () => ok(TODAY_SLOTS),
    save_slot_attendance: () => ok({ ok: true, checkedAt: "2026-04-20T09:00:00+09:00" }),
    get_drive_user: () => ok({ displayName: "Demo", emailAddress: "demo@example.com" }),
    get_neis_api_key: () => Promise.resolve(""),
    save_neis_api_key: () => ok({ ok: true }),
    get_password: () => Promise.resolve(""),
    import_students_file: (classKey) => ok({ classKey, students: [] }),
    preview_neis_public_timetable: () => ok({ school: { name: "Demo High School" }, lessons: [] }),
    publish_neis_timetable_for_week: () => ok({ ok: true, count: 0, effectiveFrom: "2026-04-20" }),
    find_neis_subject_candidates: () => ok({ scope: "grade", candidates: [] }),
    start_run: () => ok({ ok: true }),
  };
}
