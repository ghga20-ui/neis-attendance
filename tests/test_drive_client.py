from unittest.mock import MagicMock
import ssl

from subject_teacher.drive.client import DriveAppDataClient


def mock_files(list_result: list[dict]):
    files = MagicMock()
    files.list.return_value.execute.return_value = {"files": list_result}
    return files


def test_find_file_id_returns_none_when_absent():
    service = MagicMock()
    service.files.return_value = mock_files([])

    client = DriveAppDataClient(service=service)

    assert client.find_file_id("settings.json") is None
    service.files.return_value.list.assert_called_once()


def test_find_file_id_returns_id_when_present():
    service = MagicMock()
    service.files.return_value = mock_files([{"id": "abc123", "name": "settings.json"}])

    client = DriveAppDataClient(service=service)

    assert client.find_file_id("settings.json") == "abc123"


def test_find_file_id_retries_transient_ssl_wrong_version():
    execute = MagicMock(side_effect=[
        ssl.SSLError("[SSL: WRONG_VERSION_NUMBER] wrong version number"),
        {"files": [{"id": "abc123", "name": "settings.json"}]},
    ])
    service = MagicMock()
    service.files.return_value.list.return_value.execute = execute

    client = DriveAppDataClient(service=service)

    assert client.find_file_id("settings.json") == "abc123"
    assert execute.call_count == 2


def test_find_file_id_retries_transient_ssl_bad_record_mac():
    execute = MagicMock(side_effect=[
        ssl.SSLError("[SSL: DECRYPTION_FAILED_OR_BAD_RECORD_MAC] decryption failed or bad record mac"),
        {"files": [{"id": "abc123", "name": "settings.json"}]},
    ])
    service = MagicMock()
    service.files.return_value.list.return_value.execute = execute

    client = DriveAppDataClient(service=service)

    assert client.find_file_id("settings.json") == "abc123"
    assert execute.call_count == 2


def test_upsert_json_creates_when_absent():
    service = MagicMock()
    service.files.return_value.list.return_value.execute.return_value = {"files": []}
    service.files.return_value.create.return_value.execute.return_value = {"id": "new123"}

    client = DriveAppDataClient(service=service)
    file_id = client.upsert_json("settings.json", {"schemaVersion": 1})

    assert file_id == "new123"
    service.files.return_value.create.assert_called_once()


def test_upsert_json_updates_when_present():
    service = MagicMock()
    service.files.return_value.list.return_value.execute.return_value = {
        "files": [{"id": "existing", "name": "settings.json"}]
    }
    service.files.return_value.update.return_value.execute.return_value = {"id": "existing"}

    client = DriveAppDataClient(service=service)
    file_id = client.upsert_json("settings.json", {"schemaVersion": 1})

    assert file_id == "existing"
    service.files.return_value.update.assert_called_once()
    service.files.return_value.create.assert_not_called()
