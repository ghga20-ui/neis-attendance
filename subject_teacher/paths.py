"""Path helpers for local app data used by the subject teacher app."""
from __future__ import annotations

import os
from pathlib import Path

APP_DIR_NAME = "NeisSubject"


def get_app_data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    if not base:
        base = str(Path.home() / "AppData" / "Local")

    app_data_dir = Path(base) / APP_DIR_NAME
    app_data_dir.mkdir(parents=True, exist_ok=True)
    return app_data_dir


def get_token_path() -> Path:
    return get_app_data_dir() / "token.bin"


def get_password_path() -> Path:
    return get_app_data_dir() / "password.bin"


def get_neis_api_key_path() -> Path:
    return get_app_data_dir() / "neis_api_key.bin"


def get_client_secrets_path() -> Path:
    project_root = Path(__file__).resolve().parent.parent
    project_path = project_root / "client_secrets.json"
    if project_path.exists():
        return project_path
    return get_app_data_dir() / "client_secrets.json"


def get_students_path() -> Path:
    return get_app_data_dir() / "students.local.json"
