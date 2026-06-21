"""Google Drive appDataFolder JSON CRUD helpers."""
from __future__ import annotations

import io
import json
import ssl
from collections.abc import Callable
from typing import Any

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload


def _is_transient_ssl_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return isinstance(exc, ssl.SSLError) and (
        "wrong_version_number" in message
        or "wrong version number" in message
        or "decryption_failed_or_bad_record_mac" in message
        or "bad record mac" in message
    )


def _with_transient_retry(operation: Callable[[], Any], attempts: int = 3) -> Any:
    last_error: Exception | None = None
    for _ in range(attempts):
        try:
            return operation()
        except Exception as exc:
            if not _is_transient_ssl_error(exc):
                raise
            last_error = exc
    if last_error is not None:
        raise last_error
    return operation()


class DriveAppDataClient:
    """Thin wrapper around Drive v3 appDataFolder operations."""

    def __init__(self, credentials=None, service=None):
        if service is None:
            if credentials is None:
                raise ValueError("either credentials or service must be provided")
            service = build("drive", "v3", credentials=credentials, cache_discovery=False)
        self._service = service

    def find_file_id(self, name: str) -> str | None:
        response = _with_transient_retry(
            lambda: self._service.files()
            .list(
                    q=f"name = '{name}' and 'appDataFolder' in parents and trashed = false",
                    spaces="appDataFolder",
                    fields="files(id, name)",
                    pageSize=10,
                )
            .execute()
        )
        files = response.get("files", [])
        return files[0]["id"] if files else None

    def read_json(self, name: str) -> dict[str, Any] | None:
        file_id = self.find_file_id(name)
        if file_id is None:
            return None

        request = self._service.files().get_media(fileId=file_id)
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)
        done = False
        while not done:
            _, done = _with_transient_retry(lambda: downloader.next_chunk())
        return json.loads(buffer.getvalue().decode("utf-8"))

    def upsert_json(self, name: str, payload: dict[str, Any]) -> str:
        media = MediaIoBaseUpload(
            io.BytesIO(json.dumps(payload, ensure_ascii=False).encode("utf-8")),
            mimetype="application/json",
            resumable=False,
        )
        file_id = self.find_file_id(name)
        if file_id is None:
            response = _with_transient_retry(
                lambda: self._service.files()
                .create(
                        body={"name": name, "parents": ["appDataFolder"]},
                        media_body=media,
                        fields="id",
                    )
                .execute()
            )
            return response["id"]

        _with_transient_retry(
            lambda: self._service.files().update(fileId=file_id, media_body=media, fields="id").execute()
        )
        return file_id

    def delete(self, name: str) -> bool:
        file_id = self.find_file_id(name)
        if file_id is None:
            return False
        _with_transient_retry(lambda: self._service.files().delete(fileId=file_id).execute())
        return True

    def list_files(self) -> list[str]:
        response = _with_transient_retry(
            lambda: self._service.files()
            .list(
                    spaces="appDataFolder",
                    fields="files(id, name)",
                    pageSize=100,
                )
            .execute()
        )
        return [item["name"] for item in response.get("files", [])]
