from pathlib import Path

from subject_teacher.drive.schemas import (
    Absence,
    MarkType,
    MonthlyAttendance,
    SlotAttendance,
    Timetable,
    TimetableSlot,
)
from subject_teacher.state import (
    clear_local_password,
    load_local_password,
    parse_students_tsv,
    parse_timetable_tsv,
    save_local_password,
    serialize_students_tsv,
    serialize_timetable_tsv,
    summarize_day,
)


def test_local_password_roundtrip(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    save_local_password("pw-1234")
    assert load_local_password() == "pw-1234"

    clear_local_password()
    assert load_local_password() == ""


def test_timetable_tsv_roundtrip():
    raw = (
        "slot_id\tday\tperiod\tgrade\tclass_no\tsubject_name\tneis_subject_label\n"
        "mon-3\tmon\t3\t2\t1\t문학\t2학년 1(문학)\n"
    )

    timetable = parse_timetable_tsv(raw, effective_from="2026-03-02")
    dumped = serialize_timetable_tsv(timetable)

    assert "mon-3\tmon\t3\t2\t1\t문학\t2학년 1(문학)" in dumped


def test_timetable_tsv_defaults_neis_label_to_subject_name():
    raw = (
        "slot_id\tday\tperiod\tgrade\tclass_no\tsubject_name\n"
        "mon-3\tmon\t3\t2\t1\t문학\n"
    )

    timetable = parse_timetable_tsv(raw, effective_from="2026-03-02")

    assert timetable.slots[0].subject_name == "문학"
    assert timetable.slots[0].neis_subject_label == "문학"


def test_timetable_tsv_accepts_nonnumeric_class_label():
    raw = (
        "slot_id\tday\tperiod\tgrade\tclass_no\tsubject_name\n"
        "mon-3\tmon\t3\t2\t문학 A\t문학\n"
    )

    timetable = parse_timetable_tsv(raw, effective_from="2026-03-02")
    dumped = serialize_timetable_tsv(timetable)

    assert timetable.slots[0].class_no == "문학 A"
    assert "mon-3\tmon\t3\t2\t문학 A\t문학\t문학" in dumped


def test_timetable_tsv_blank_neis_label_defaults_to_subject_name():
    raw = (
        "slot_id\tday\tperiod\tgrade\tclass_no\tsubject_name\tneis_subject_label\n"
        "mon-3\tmon\t3\t2\t1\t문학\t\n"
    )

    timetable = parse_timetable_tsv(raw, effective_from="2026-03-02")

    assert timetable.slots[0].neis_subject_label == "문학"


def test_students_tsv_roundtrip():
    raw = (
        "class_key\tnumber\tname\n"
        "2-1\t18\t정수빈\n"
        "2-1\t19\t조성준\n"
    )

    students = parse_students_tsv(raw)
    dumped = serialize_students_tsv(students)

    assert "2-1\t18\t정수빈" in dumped
    assert "2-1\t19\t조성준" in dumped


def test_summarize_day_uses_timetable_and_attendance():
    class FakeStore:
        def load_timetable(self):
            return Timetable(
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
                    ),
                    TimetableSlot(
                        id="mon-6",
                        dayOfWeek=1,
                        period=6,
                        grade=2,
                        classNo=2,
                        subjectName="문학",
                        neisSubjectLabel="2학년 2(문학)",
                    ),
                ],
            )

        def load_monthly(self, month: str):
            assert month == "2026-04"
            return MonthlyAttendance(
                schemaVersion=1,
                month=month,
                records={
                    "2026-04-20": {
                        "mon-3": SlotAttendance(
                            absences=[Absence(studentNumber=18, markType=MarkType.ABSENT, note="")],
                            checkedAt="2026-04-20T09:55:00+09:00",
                            source="mobile",
                            syncedToNeis=True,
                            closedOnNeis=True,
                        )
                    }
                },
            )

    summaries = summarize_day(FakeStore(), "2026-04-20")

    assert len(summaries) == 2
    assert summaries[0].slot_id == "mon-3"
    assert summaries[0].checked is True
    assert summaries[0].absence_count == 1
    assert summaries[1].slot_id == "mon-6"
    assert summaries[1].checked is False
