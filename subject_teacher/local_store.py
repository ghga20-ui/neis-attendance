"""DPAPI-backed local storage for the student roster (names never leave the device)."""
from __future__ import annotations

from subject_teacher.auth.token_store import (
    TokenNotFoundError,
    delete_token,
    load_token,
    save_token,
)
from subject_teacher.drive.migrations import migrate
from subject_teacher.drive.schemas import Students, numbers_only
from subject_teacher.paths import get_students_path


def save_local_students(students: Students) -> None:
    save_token(get_students_path(), students.model_dump(by_alias=True, mode="json"))


def load_local_students() -> Students | None:
    try:
        payload = load_token(get_students_path())
    except TokenNotFoundError:
        return None
    return Students.model_validate(migrate(payload))


def clear_local_students() -> None:
    delete_token(get_students_path())


def migrate_students_from_drive(client) -> bool:
    """One-time: keep the full roster (with names) on-device and rewrite the cloud
    copy as numbers-only. Idempotent: returns False when no cloud students.json exists.
    Never overwrites an existing local roster (local is the source of truth for names).
    """
    raw = client.read_json("students.json")
    if raw is None:
        return False
    students = Students.model_validate(migrate(raw))
    if load_local_students() is None:
        save_local_students(students)
    client.upsert_json(
        "students.json",
        numbers_only(students).model_dump(by_alias=True, mode="json"),
    )
    return True
