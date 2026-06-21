from unittest.mock import MagicMock

from google.auth.exceptions import RefreshError

from subject_teacher.auth import google_oauth


def test_credentials_to_payload_roundtrip():
    credentials = MagicMock()
    credentials.token = "ya29.xxx"
    credentials.refresh_token = "1//xyz"
    credentials.token_uri = "https://oauth2.googleapis.com/token"
    credentials.client_id = "abc.apps.googleusercontent.com"
    credentials.client_secret = "GOCSPX-secret"
    credentials.scopes = ["https://www.googleapis.com/auth/drive.appdata"]

    payload = google_oauth._credentials_to_payload(credentials)

    assert payload["refresh_token"] == "1//xyz"
    assert payload["scopes"] == ["https://www.googleapis.com/auth/drive.appdata"]


def test_payload_to_credentials_roundtrip():
    payload = {
        "token": "ya29.xxx",
        "refresh_token": "1//xyz",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "abc.apps.googleusercontent.com",
        "client_secret": "GOCSPX-secret",
        "scopes": ["https://www.googleapis.com/auth/drive.appdata"],
    }

    credentials = google_oauth._payload_to_credentials(payload)

    assert credentials.refresh_token == "1//xyz"
    assert "drive.appdata" in credentials.scopes[0]


def test_load_credentials_returns_none_when_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))

    assert google_oauth.load_credentials() is None


def test_get_credentials_deletes_invalid_refresh_token_and_requests_reauth(monkeypatch):
    credentials = MagicMock()
    credentials.expired = True
    credentials.refresh_token = "revoked"
    credentials.refresh.side_effect = RefreshError("invalid_grant: Token has been expired or revoked.")

    deleted_paths = []
    monkeypatch.setattr(google_oauth, "load_credentials", lambda: credentials)
    monkeypatch.setattr(google_oauth, "delete_token", lambda path: deleted_paths.append(path))

    try:
        google_oauth.get_credentials()
    except google_oauth.ReauthenticationRequiredError as exc:
        assert exc.code == "reauth_required"
        assert "Google Drive 인증이 만료" in str(exc)
    else:
        raise AssertionError("expected reauthentication error")

    assert deleted_paths == [google_oauth.get_token_path()]


def test_is_reauthentication_error_detects_drive_api_invalid_grant():
    exc = RuntimeError(
        "('invalid_grant: Token has been expired or revoked.', "
        "{'error': 'invalid_grant', 'error_description': 'Token has been expired or revoked.'})"
    )

    assert google_oauth.is_reauthentication_error(exc) is True
