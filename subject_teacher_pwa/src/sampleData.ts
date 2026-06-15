import type { StudentEntry, TimetableSlot } from "./lib/schemas";

export const sampleSlots: TimetableSlot[] = [
  {
    id: "mon-3",
    dayOfWeek: 1,
    period: 3,
    grade: 2,
    classNo: "1",
    subjectName: "문학",
    neisSubjectLabel: "문학",
  },
  {
    id: "mon-6",
    dayOfWeek: 1,
    period: 6,
    grade: 2,
    classNo: "2",
    subjectName: "문학",
    neisSubjectLabel: "문학",
  },
  {
    id: "mon-7",
    dayOfWeek: 1,
    period: 7,
    grade: 1,
    classNo: "선택1",
    subjectName: "독서",
    neisSubjectLabel: "독서",
  },
];

export const sampleRosters: Record<string, StudentEntry[]> = {
  "2-1": [
    { number: 1, name: "박서연" },
    { number: 2, name: "이준호" },
    { number: 3, name: "김도윤" },
    { number: 4, name: "최하린" },
    { number: 12, name: "정민재" },
  ],
  "2-2": [
    { number: 1, name: "강유나" },
    { number: 2, name: "문지호" },
    { number: 8, name: "오서진" },
  ],
  "1-선택1": [
    { number: 5, name: "한지우" },
    { number: 9, name: "송아린" },
  ],
};
