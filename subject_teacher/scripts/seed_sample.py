"""Seed sample timetable, students, and attendance data into appDataFolder."""
from __future__ import annotations

import argparse

from subject_teacher.auth.google_oauth import get_credentials
from subject_teacher.drive.client import DriveAppDataClient
from subject_teacher.drive.schemas import (
    Absence,
    MarkType,
    MonthlyAttendance,
    Semester,
    Settings,
    SlotAttendance,
    StudentEntry,
    Students,
    Timetable,
    TimetableSlot,
)
from subject_teacher.drive.store import DriveStore
from subject_teacher.local_store import save_local_students


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default="2026-04-20")
    parser.add_argument("--region", default="경기")
    args = parser.parse_args()

    store = DriveStore(DriveAppDataClient(credentials=get_credentials()))

    store.save_settings(
        Settings(
            schemaVersion=1,
            teacherName="TEST",
            schoolName="TEST-HS",
            region=args.region,
            semester=Semester(year=2026, term=1),
            closeByDefault=False,
            updatedAt=f"{args.date}T09:00:00+09:00",
        )
    )
    store.save_timetable(
        Timetable(
            schemaVersion=1,
            effectiveFrom="2026-03-02",
            slots=[
                TimetableSlot(
                    id="mon-3",
                    dayOfWeek=1,
                    period=3,
                    grade=2,
                    classNo=1,
                    subjectName="문학",
                    neisSubjectLabel="2학년 1(문학)",
                )
            ],
        )
    )
    sample_students = Students(
        schemaVersion=1,
        classes={
            "2-1": [
                StudentEntry(number=18, name="정소빈"),
                StudentEntry(number=19, name="조성준"),
                StudentEntry(number=20, name="조승현"),
            ]
        },
    )
    save_local_students(sample_students)
    store.save_students(sample_students)
    store.save_monthly(
        MonthlyAttendance(
            schemaVersion=1,
            month=args.date[:7],
            records={
                args.date: {
                    "mon-3": SlotAttendance(
                        absences=[
                            Absence(studentNumber=18, markType=MarkType.ABSENT, note=""),
                            Absence(studentNumber=19, markType=MarkType.EXCUSED, note="교외체험"),
                        ],
                        checkedAt=f"{args.date}T09:55:00+09:00",
                        source="mobile",
                        syncedToNeis=False,
                        closedOnNeis=False,
                    )
                }
            },
        )
    )
    print("seeded.")


if __name__ == "__main__":
    main()
