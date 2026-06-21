from unittest.mock import MagicMock

import subject_teacher.app_service as app_service
from subject_teacher.app_service import build_day_input, run_day
from subject_teacher.drive.schemas import MonthlyAttendance, Semester, Settings, SlotAttendance, Timetable, TimetableSlot


def test_build_day_input_filters_slots_by_weekday_and_records():
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
                        id="tue-1",
                        dayOfWeek=2,
                        period=1,
                        grade=2,
                        classNo=3,
                        subjectName="영어",
                        neisSubjectLabel="영어(2-3)",
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
                            absences=[],
                            checkedAt="2026-04-20T09:55:00+09:00",
                            source="mobile",
                            syncedToNeis=False,
                            closedOnNeis=False,
                        )
                    }
                },
            )

    settings = Settings(
        schemaVersion=1,
        teacherName="T",
        schoolName="S",
        region="경기",
        semester=Semester(year=2026, term=1),
        closeByDefault=False,
        updatedAt="2026-04-20T09:00:00+09:00",
    )

    day_input = build_day_input(FakeStore(), settings, "2026-04-20")

    assert day_input.date == "2026-04-20"
    assert len(day_input.slots) == 1
    assert day_input.slots[0][0].id == "mon-3"


def test_run_day_keeps_browser_open_when_requested(monkeypatch):
    driver = MagicMock()
    monkeypatch.setattr("subject_teacher.app_service.prepare_run_context", MagicMock())
    monkeypatch.setattr("subject_teacher.app_service.create_driver", MagicMock(return_value=driver))
    monkeypatch.setattr("subject_teacher.app_service.utils.open_neis_direct", MagicMock())
    monkeypatch.setattr("subject_teacher.app_service.process_day", MagicMock(return_value=[]))

    run_day("2026-04-20", "pw", False, keep_browser_open=True)

    app_service.create_driver.assert_called_once_with(keep_browser_open=True)
    driver.quit.assert_not_called()
