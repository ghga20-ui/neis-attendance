"""Typed facade over Drive appDataFolder JSON storage."""
from __future__ import annotations

from subject_teacher.drive.client import DriveAppDataClient
from subject_teacher.drive.migrations import migrate
from subject_teacher.drive.schemas import MonthlyAttendance, Settings, Timetable


class DriveStore:
    SETTINGS = "settings.json"
    TIMETABLE = "timetable.json"

    def __init__(self, client: DriveAppDataClient):
        self._client = client

    def load_settings(self) -> Settings | None:
        raw = self._client.read_json(self.SETTINGS)
        if raw is None:
            return None
        return Settings.model_validate(migrate(raw))

    def save_settings(self, settings: Settings) -> str:
        return self._client.upsert_json(
            self.SETTINGS,
            settings.model_dump(by_alias=True, mode="json"),
        )

    def load_timetable(self) -> Timetable | None:
        raw = self._client.read_json(self.TIMETABLE)
        if raw is None:
            return None
        return Timetable.model_validate(migrate(raw))

    def save_timetable(self, timetable: Timetable) -> str:
        return self._client.upsert_json(
            self.TIMETABLE,
            timetable.model_dump(by_alias=True, mode="json"),
        )

    @staticmethod
    def _monthly_filename(month: str) -> str:
        return f"attendance-{month}.json"

    def load_monthly(self, month: str) -> MonthlyAttendance | None:
        raw = self._client.read_json(self._monthly_filename(month))
        if raw is None:
            return None
        return MonthlyAttendance.model_validate(migrate(raw))

    def save_monthly(self, monthly: MonthlyAttendance) -> str:
        return self._client.upsert_json(
            self._monthly_filename(monthly.month),
            monthly.model_dump(by_alias=True, mode="json"),
        )
