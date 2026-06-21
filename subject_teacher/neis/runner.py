"""Orchestrate per-day NEIS subject attendance automation."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Literal

from selenium.webdriver.remote.webdriver import WebDriver

from subject_teacher.drive.schemas import SlotAttendance, TimetableSlot
from subject_teacher.neis import subject_commands as default_commands

logger = logging.getLogger(__name__)

SlotPair = tuple[TimetableSlot, SlotAttendance]
OnUpdate = Callable[[str, bool, bool], None]


@dataclass
class DayInput:
    date: str
    year: int
    term: int
    slots: list[SlotPair]


@dataclass
class SlotResult:
    slot_id: str
    status: Literal["ok", "skipped", "failed"]
    error: str = ""


def process_day(
    driver: WebDriver,
    day: DayInput,
    close_after: bool,
    cmd=default_commands,
    on_update: OnUpdate | None = None,
) -> list[SlotResult]:
    """Process a single day of attendance records with per-slot isolation."""
    results: list[SlotResult] = []

    try:
        cmd.open_subject_attendance_page(driver, year=day.year, term=day.term)
        cmd.select_day_mode(driver)
        cmd.select_date(driver, day.date)
        cmd.click_search(driver)
    except Exception as exc:
        if not getattr(cmd, "page_has_period_rows", lambda _driver: False)(driver):
            logger.exception("failed to prepare NEIS day view")
            return [
                SlotResult(slot_id=slot.id, status="failed", error=f"prepare: {exc}")
                for slot, _ in day.slots
            ]

    for slot, attendance in day.slots:
        if attendance.synced_to_neis and (attendance.closed_on_neis or not close_after):
            results.append(SlotResult(slot_id=slot.id, status="skipped"))
            continue

        try:
            cmd.select_period(driver, slot.period, slot.neis_subject_label, slot.grade, slot.class_no)
            cmd.click_reset(driver)

            absent = [item for item in attendance.absences if item.mark_type.value == "absent"]
            excused = [item for item in attendance.absences if item.mark_type.value == "excused"]
            expected_result_count = len(absent) + len(excused)

            cmd.ensure_excused_mode(driver, False)
            for item in absent:
                cmd.click_attendance_cell(driver, item.student_number, expected_mark="absent")

            if excused:
                cmd.ensure_excused_mode(driver, True)
                for item in excused:
                    cmd.click_attendance_cell(driver, item.student_number, expected_mark="excused")
                cmd.ensure_excused_mode(driver, False)

            cmd.verify_result_count(driver, expected_result_count)
            cmd.click_save(driver)
            cmd.verify_result_count(driver, expected_result_count)
            if close_after:
                cmd.click_close(driver)

            if on_update is not None:
                on_update(slot.id, synced=True, closed=close_after)
            results.append(SlotResult(slot_id=slot.id, status="ok"))
        except Exception as exc:
            logger.exception("slot %s failed", slot.id)
            results.append(SlotResult(slot_id=slot.id, status="failed", error=str(exc)))

    return results
