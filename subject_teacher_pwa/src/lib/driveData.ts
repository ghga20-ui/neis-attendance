// High-level repository over the Drive appDataFolder JSON files.
//
// Reads are validated through the shared zod schemas so a corrupt or
// out-of-contract file fails loudly instead of silently rendering wrong data.
// Writes use read-modify-write on the monthly attendance file; concurrent
// desktop edits resolve as last-write-wins per the design.

import { readJson, writeJson } from "./drive";
import {
  MonthlyAttendanceSchema,
  SCHEMA_VERSION,
  SettingsSchema,
  StudentsSchema,
  TimetableSchema,
  type MonthlyAttendance,
  type Settings,
  type SlotAttendance,
  type Students,
  type Timetable,
} from "./schemas";

export const FILE_NAMES = {
  settings: "settings.json",
  timetable: "timetable.json",
  students: "students.json",
  attendance: (month: string) => `attendance-${month}.json`,
} as const;

export async function loadSettings(): Promise<Settings | null> {
  const file = await readJson(FILE_NAMES.settings);
  return file ? SettingsSchema.parse(file.data) : null;
}

export async function loadTimetable(): Promise<Timetable | null> {
  const file = await readJson(FILE_NAMES.timetable);
  return file ? TimetableSchema.parse(file.data) : null;
}

export async function loadStudents(): Promise<Students | null> {
  const file = await readJson(FILE_NAMES.students);
  return file ? StudentsSchema.parse(file.data) : null;
}

export async function loadMonthlyAttendance(month: string): Promise<MonthlyAttendance | null> {
  const file = await readJson(FILE_NAMES.attendance(month));
  return file ? MonthlyAttendanceSchema.parse(file.data) : null;
}

export interface LoadedDriveData {
  settings: Settings | null;
  timetable: Timetable | null;
  students: Students | null;
  attendance: MonthlyAttendance | null;
}

/** Load every Drive file the home screen needs for a given month, in parallel. */
export async function loadAll(month: string): Promise<LoadedDriveData> {
  const [settings, timetable, students, attendance] = await Promise.all([
    loadSettings(),
    loadTimetable(),
    loadStudents(),
    loadMonthlyAttendance(month),
  ]);
  return { settings, timetable, students, attendance };
}

/**
 * Merge one slot's attendance into the monthly file and upload it.
 * Creates the monthly file when it does not exist yet.
 */
export async function saveSlotAttendance(
  month: string,
  date: string,
  slotId: string,
  payload: SlotAttendance,
): Promise<void> {
  const existing = await readJson(FILE_NAMES.attendance(month));
  const doc: MonthlyAttendance = existing
    ? MonthlyAttendanceSchema.parse(existing.data)
    : { schemaVersion: SCHEMA_VERSION, month, records: {} };

  doc.records[date] = { ...(doc.records[date] ?? {}), [slotId]: payload };

  await writeJson(FILE_NAMES.attendance(month), doc, existing?.id ?? null);
}
