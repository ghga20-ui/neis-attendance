"""Reusable service layer shared by the CLI runner and the GUI."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date as date_type

import config
import regions
import utils
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

from subject_teacher.drive.store import DriveStore
from subject_teacher.drive.schemas import Settings
from subject_teacher.neis.runner import DayInput, SlotResult, process_day
from subject_teacher.state import build_store


@dataclass
class RunContext:
    store: DriveStore
    settings: Settings
    day_input: DayInput
    region_key: str


def create_driver(keep_browser_open: bool = False):
    options = Options()
    profile_dir = os.path.join(os.path.expanduser("~"), "AppData", "Local", "Chrome_NEIS_Profile")
    os.makedirs(profile_dir, exist_ok=True)
    options.add_argument(f"--user-data-dir={profile_dir}")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    if keep_browser_open:
        options.add_experimental_option("detach", True)
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-popup-blocking")
    return webdriver.Chrome(options=options)


def build_day_input(store: DriveStore, settings: Settings, date_str: str) -> DayInput:
    timetable = store.load_timetable()
    if timetable is None:
        raise RuntimeError("timetable.json not found in Drive appDataFolder")

    month = date_str[:7]
    monthly = store.load_monthly(month)
    if monthly is None or date_str not in monthly.records:
        raise RuntimeError(f"no attendance records for {date_str}")

    weekday = date_type.fromisoformat(date_str).isoweekday()
    day_map = monthly.records[date_str]

    pairs = []
    for slot in timetable.slots:
        if slot.day_of_week != weekday:
            continue
        attendance = day_map.get(slot.id)
        if attendance is None:
            continue
        pairs.append((slot, attendance))

    return DayInput(
        date=date_str,
        year=settings.semester.year,
        term=settings.semester.term,
        slots=pairs,
    )


def update_flags(store: DriveStore, month: str, slot_id: str, date_str: str, synced: bool, closed: bool) -> None:
    monthly = store.load_monthly(month)
    if monthly is None:
        return

    slot_attendance = monthly.records.get(date_str, {}).get(slot_id)
    if slot_attendance is None:
        return

    updated = slot_attendance.model_copy(
        update={"synced_to_neis": synced, "closed_on_neis": closed}
    )
    monthly.records[date_str][slot_id] = updated
    store.save_monthly(monthly)


def prepare_run_context(date_str: str, region_override: str | None = None) -> RunContext:
    store = build_store()
    settings = store.load_settings()
    if settings is None:
        raise RuntimeError("settings.json not found in Drive appDataFolder")

    region_key = region_override or settings.region
    if region_key not in regions.REGIONS:
        raise RuntimeError(f"unknown region: {region_key}")

    return RunContext(
        store=store,
        settings=settings,
        day_input=build_day_input(store, settings, date_str),
        region_key=region_key,
    )


def run_day(
    date_str: str,
    password: str,
    close_after: bool,
    region_override: str | None = None,
    keep_browser_open: bool = False,
) -> list[SlotResult]:
    context = prepare_run_context(date_str, region_override=region_override)
    config.selected_region = context.region_key

    driver = create_driver(keep_browser_open=keep_browser_open)
    try:
        utils.open_neis_direct(driver, password)
        month = date_str[:7]

        def callback(slot_id: str, synced: bool, closed: bool) -> None:
            update_flags(context.store, month, slot_id, date_str, synced, closed)

        return process_day(
            driver,
            context.day_input,
            close_after=close_after,
            on_update=callback,
        )
    finally:
        if not keep_browser_open:
            try:
                driver.quit()
            except Exception:
                pass
