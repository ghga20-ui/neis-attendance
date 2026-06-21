import pytest
from pydantic import ValidationError

from subject_teacher.drive.schemas import (
    Absence,
    AssignedLesson,
    DayAttendance,
    MarkType,
    MonthlyAttendance,
    SCHEMA_VERSION,
    Settings,
    SlotAttendance,
    StudentEntry,
    Students,
    Timetable,
    TimetableSlot,
)


def test_settings_roundtrip():
    data = {
        "schemaVersion": 1,
        "teacherName": "홍길동",
        "schoolName": "○○고등학교",
        "region": "경기",
        "semester": {"year": 2026, "term": 1},
        "closeByDefault": False,
        "timetableMode": "neis",
        "assignedLessons": [
            {
                "grade": 2,
                "classNo": "1",
                "subjectName": "수학1",
                "neisSubjectLabel": "수학Ⅰ",
                "subjectAliases": ["수학 I"],
            }
        ],
        "updatedAt": "2026-04-17T09:00:00+09:00",
    }

    settings = Settings.model_validate(data)

    assert settings.teacher_name == "홍길동"
    assert settings.region == "경기"
    assert settings.semester.year == 2026
    assert settings.timetable_mode == "neis"
    assert settings.assigned_lessons[0].subject_aliases == ["수학 I"]
    assert settings.model_dump(by_alias=True)["teacherName"] == "홍길동"


def test_settings_defaults_to_neis_timetable_mode():
    settings = Settings.model_validate(
        {
            "schemaVersion": 1,
            "teacherName": "홍길동",
            "schoolName": "○○고등학교",
            "region": "경기",
            "semester": {"year": 2026, "term": 1},
            "closeByDefault": False,
            "updatedAt": "2026-04-17T09:00:00+09:00",
        }
    )

    assert settings.timetable_mode == "neis"
    assert settings.assigned_lessons == []


def test_assigned_lesson_accepts_aliases_and_nonnumeric_class_label():
    lesson = AssignedLesson(
        grade=2,
        classNo="문학 A",
        subjectName="문학",
        neisSubjectLabel="문학",
        subjectAliases=["문학Ⅰ"],
    )

    assert lesson.class_no == "문학 A"
    assert lesson.subject_aliases == ["문학Ⅰ"]


def test_assigned_lesson_accepts_korean_grade_label():
    lesson = AssignedLesson(
        grade="2학년",
        classNo="1",
        subjectName="문학",
        neisSubjectLabel="문학",
    )

    assert lesson.grade == 2


def test_settings_region_validation():
    bad = {
        "schemaVersion": 1,
        "teacherName": "X",
        "schoolName": "Y",
        "region": "ZZ99",
        "semester": {"year": 2026, "term": 1},
        "closeByDefault": False,
        "updatedAt": "2026-04-17T09:00:00+09:00",
    }

    with pytest.raises(ValidationError):
        Settings.model_validate(bad)


def test_timetable_slot_day_period_range():
    with pytest.raises(ValidationError):
        TimetableSlot(
            id="x-0",
            dayOfWeek=0,
            period=1,
            grade=2,
            classNo=3,
            subjectName="수학",
            neisSubjectLabel="수학(2-3)",
        )

    with pytest.raises(ValidationError):
        TimetableSlot(
            id="x-8",
            dayOfWeek=1,
            period=8,
            grade=2,
            classNo=3,
            subjectName="수학",
            neisSubjectLabel="수학(2-3)",
        )


def test_timetable_slot_accepts_nonnumeric_class_label():
    slot = TimetableSlot(
        id="mon-3",
        dayOfWeek=1,
        period=3,
        grade=2,
        classNo="문학 A",
        subjectName="문학",
        neisSubjectLabel="문학",
    )

    assert slot.class_no == "문학 A"


def test_timetable_slot_coerces_legacy_numeric_class_label():
    slot = TimetableSlot(
        id="mon-3",
        dayOfWeek=1,
        period=3,
        grade=2,
        classNo=3,
        subjectName="문학",
        neisSubjectLabel="문학",
    )

    assert slot.class_no == "3"


def test_timetable_slot_rejects_blank_class_label():
    with pytest.raises(ValidationError):
        TimetableSlot(
            id="mon-3",
            dayOfWeek=1,
            period=3,
            grade=2,
            classNo=" ",
            subjectName="문학",
            neisSubjectLabel="문학",
        )


def test_students_key_format():
    students = Students.model_validate(
        {
            "schemaVersion": 1,
            "classes": {
                "2-3": [{"number": 1, "name": "김가나"}],
                "2-문학 A": [{"number": 2, "name": "박다라"}],
            },
        }
    )

    assert "2-3" in students.classes
    assert students.classes["2-3"][0].name == "김가나"
    assert students.classes["2-문학 A"][0].name == "박다라"


def test_students_invalid_class_key():
    with pytest.raises(ValidationError):
        Students.model_validate(
            {
                "schemaVersion": 1,
                "classes": {"two-three": [{"number": 1, "name": "김"}]},
            }
        )


def test_absence_mark_type_accepts_both():
    absent = Absence(studentNumber=1, markType="absent", note="")
    excused = Absence(studentNumber=2, markType="excused", note="교외체험학습")

    assert absent.mark_type is MarkType.ABSENT
    assert excused.mark_type is MarkType.EXCUSED


def test_absence_rejects_invalid_mark_type():
    with pytest.raises(ValidationError):
        Absence(studentNumber=1, markType="tardy", note="")


def test_monthly_attendance_minimal():
    data = {
        "schemaVersion": 1,
        "month": "2026-04",
        "records": {
            "2026-04-17": {
                "mon-1": {
                    "absences": [
                        {"studentNumber": 15, "markType": "excused", "note": "교외체험학습"},
                        {"studentNumber": 22, "markType": "absent", "note": ""},
                    ],
                    "checkedAt": "2026-04-17T09:55:00+09:00",
                    "source": "mobile",
                    "syncedToNeis": False,
                    "closedOnNeis": False,
                }
            }
        },
    }

    monthly = MonthlyAttendance.model_validate(data)
    slot = monthly.records["2026-04-17"]["mon-1"]

    assert len(slot.absences) == 2
    assert slot.source == "mobile"
    dumped = monthly.model_dump(by_alias=True, mode="json")
    assert dumped["records"]["2026-04-17"]["mon-1"]["syncedToNeis"] is False


def test_month_format_validation():
    with pytest.raises(ValidationError):
        MonthlyAttendance.model_validate(
            {
                "schemaVersion": 1,
                "month": "202604",
                "records": {},
            }
        )


def test_schema_version_constant():
    assert SCHEMA_VERSION == 1
