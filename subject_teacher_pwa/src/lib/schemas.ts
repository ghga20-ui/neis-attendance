import { z } from "zod";

export const SCHEMA_VERSION = 1;

const schemaVersion = z.literal(SCHEMA_VERSION);
const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const classKey = z.string().regex(/^\d+-[^\t\r\n]+$/);

const classNo = z.preprocess((value) => {
  if (value === null || value === undefined) return value;
  return String(value).trim();
}, z.string().min(1).max(40).refine((value) => !/[\t\r\n]/.test(value), {
  message: "classNo must not contain tabs or line breaks",
}));

export const SemesterSchema = z.object({
  year: z.number().int().min(2024).max(2100),
  term: z.union([z.literal(1), z.literal(2)]),
});

export const SettingsSchema = z.object({
  schemaVersion: schemaVersion.default(SCHEMA_VERSION),
  teacherName: z.string(),
  schoolName: z.string(),
  region: z.string().min(1),
  semester: SemesterSchema,
  closeByDefault: z.boolean().default(false),
  updatedAt: z.string().min(1),
});

export const TimetableSlotSchema = z.object({
  id: z.string().min(1),
  dayOfWeek: z.number().int().min(1).max(5),
  period: z.number().int().min(1).max(7),
  grade: z.number().int().min(1).max(3),
  classNo,
  subjectName: z.string().min(1),
  neisSubjectLabel: z.string().min(1),
});

export const TimetableSchema = z.object({
  schemaVersion: schemaVersion.default(SCHEMA_VERSION),
  effectiveFrom: isoDate,
  slots: z.array(TimetableSlotSchema),
});

export const StudentEntrySchema = z.object({
  number: z.number().int().min(1).max(99),
  name: z.string().default(""),
});

export const StudentsSchema = z.object({
  schemaVersion: schemaVersion.default(SCHEMA_VERSION),
  classes: z.record(classKey, z.array(StudentEntrySchema)),
});

export const MarkTypeSchema = z.union([z.literal("absent"), z.literal("excused")]);

export const AbsenceSchema = z.object({
  studentNumber: z.number().int().min(1).max(99),
  markType: MarkTypeSchema,
  note: z.string().default(""),
});

export const SlotAttendanceSchema = z.object({
  absences: z.array(AbsenceSchema),
  checkedAt: z.string().min(1),
  source: z.union([z.literal("mobile"), z.literal("pc")]).default("mobile"),
  syncedToNeis: z.boolean().default(false),
  closedOnNeis: z.boolean().default(false),
});

export const MonthlyAttendanceSchema = z.object({
  schemaVersion: schemaVersion.default(SCHEMA_VERSION),
  month: isoMonth,
  records: z.record(isoDate, z.record(z.string().min(1), SlotAttendanceSchema)),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type TimetableSlot = z.infer<typeof TimetableSlotSchema>;
export type Timetable = z.infer<typeof TimetableSchema>;
export type StudentEntry = z.infer<typeof StudentEntrySchema>;
export type Students = z.infer<typeof StudentsSchema>;
export type MarkType = z.infer<typeof MarkTypeSchema>;
export type Absence = z.infer<typeof AbsenceSchema>;
export type SlotAttendance = z.infer<typeof SlotAttendanceSchema>;
export type MonthlyAttendance = z.infer<typeof MonthlyAttendanceSchema>;
