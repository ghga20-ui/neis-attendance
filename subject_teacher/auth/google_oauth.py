"""Google OAuth helpers for Drive appDataFolder access."""
from __future__ import annotations

from typing import Any

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from subject_teacher.auth.token_store import TokenNotFoundError, delete_token, load_token, save_token
from subject_teacher.paths import get_client_secrets_path, get_token_path

SCOPES = ["https://www.googleapis.com/auth/drive.appdata"]
REAUTH_MESSAGE = "Google Drive 인증이 만료됐습니다. OAuth 인증 화면에서 계정을 다시 확인해 주세요."


class ReauthenticationRequiredError(RuntimeError):
    """Raised when the stored Google refresh token can no longer be used."""

    code = "reauth_required"


def is_reauthentication_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        isinstance(exc, ReauthenticationRequiredError)
        or "invalid_grant" in text
        or "expired or revoked" in text
    )


def _credentials_to_payload(credentials: Credentials) -> dict[str, Any]:
    return {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": list(credentials.scopes) if credentials.scopes else list(SCOPES),
    }


def _payload_to_credentials(payload: dict[str, Any]) -> Credentials:
    return Credentials(
        token=payload.get("token"),
        refresh_token=payload.get("refresh_token"),
        token_uri=payload.get("token_uri"),
        client_id=payload.get("client_id"),
        client_secret=payload.get("client_secret"),
        scopes=payload.get("scopes") or SCOPES,
    )


def authorize_interactive() -> Credentials:
    secrets_path = get_client_secrets_path()
    if not secrets_path.exists():
        raise FileNotFoundError(
            f"client_secrets.json not found at {secrets_path}. "
            "Download it from Google Cloud Console and place it there."
        )

    flow = InstalledAppFlow.from_client_secrets_file(str(secrets_path), SCOPES)
    credentials = flow.run_local_server(port=0, access_type="offline", prompt="consent")
    save_token(get_token_path(), _credentials_to_payload(credentials))
    return credentials


def load_credentials() -> Credentials | None:
    try:
        payload = load_token(get_token_path())
    except TokenNotFoundError:
        return None
    return _payload_to_credentials(payload)


def get_credentials() -> Credentials:
    credentials = load_credentials()
    if credentials and credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(Request())
        except RefreshError as exc:
            delete_token(get_token_path())
            raise ReauthenticationRequiredError(REAUTH_MESSAGE) from exc
        save_token(get_token_path(), _credentials_to_payload(credentials))
        return credentials
    if credentials and credentials.valid:
        return credentials
    return authorize_interactive()


def revoke() -> None:
    delete_token(get_token_path())
