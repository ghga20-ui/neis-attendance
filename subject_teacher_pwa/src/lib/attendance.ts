import type { MarkType, SlotAttendance, StudentEntry } from "./schemas";

export type StudentMark = "present" | MarkType;
export type MarksByStudent = Record<number, StudentMark>;

export function createEmptyMarks(students: StudentEntry[]): MarksByStudent {
  return Object.fromEntries(students.map((student) => [student.number, "present"]));
}

export function cycleMark(mark: StudentMark): StudentMark {
  if (mark === "present") return "absent";
  if (mark === "absent") return "excused";
  return "present";
}

export function marksToSlotAttendance(marks: MarksByStudent, checkedAt: string): SlotAttendance {
  const absences = Object.entries(marks)
    .filter(([, mark]) => mark !== "present")
    .map(([studentNumber, mark]) => ({
      studentNumber: Number(studentNumber),
      markType: mark as MarkType,
      note: "",
    }))
    .sort((a, b) => a.studentNumber - b.studentNumber);

  return {
    absences,
    checkedAt,
    source: "mobile",
    syncedToNeis: false,
    closedOnNeis: false,
  };
}

export function summarizeLesson(slot?: SlotAttendance): {
  checked: boolean;
  label: string;
  absenceCount: number;
} {
  if (!slot) {
    return { checked: false, label: "미체크", absenceCount: 0 };
  }

  const absenceCount = slot.absences.length;
  return {
    checked: true,
    label: absenceCount ? `결과·출석인정 ${absenceCount}명` : "전원 출석",
    absenceCount,
  };
}
