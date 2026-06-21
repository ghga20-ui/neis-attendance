from subject_teacher import local_store
from subject_teacher.drive.schemas import Students, StudentEntry


def _patch_path(tmp_path, monkeypatch):
    target = tmp_path / "students.local.json"
    monkeypatch.setattr(local_store, "get_students_path", lambda: target)
    return target


def test_round_trip_is_encrypted_on_disk(tmp_path, monkeypatch):
    target = _patch_path(tmp_path, monkeypatch)
    students = Students(schemaVersion=1, classes={"2-3": [StudentEntry(number=5, name="김가나")]})
    local_store.save_local_students(students)
    assert target.exists()
    # DPAPI ciphertext must not contain the plaintext name or JSON keys
    blob = target.read_bytes()
    assert "김가나".encode("utf-8") not in blob
    assert b"classes" not in blob
    loaded = local_store.load_local_students()
    assert loaded.classes["2-3"][0].name == "김가나"


def test_load_missing_returns_none(tmp_path, monkeypatch):
    _patch_path(tmp_path, monkeypatch)
    assert local_store.load_local_students() is None


class _FakeClient:
    def __init__(self, raw):
        self.raw = raw
        self.written = {}

    def read_json(self, name):
        if name in self.written:
            return self.written[name]
        return self.raw if name == "students.json" else None

    def upsert_json(self, name, data):
        self.written[name] = data
        return "id-" + name


def test_migrate_saves_full_locally_and_rewrites_cloud_numbers_only(tmp_path, monkeypatch):
    _patch_path(tmp_path, monkeypatch)
    client = _FakeClient({"schemaVersion": 1, "classes": {"2-3": [{"number": 5, "name": "김가나"}]}})
    assert local_store.migrate_students_from_drive(client) is True
    # full name kept locally
    assert local_store.load_local_students().classes["2-3"][0].name == "김가나"
    # cloud rewritten numbers-only (name stripped), NOT deleted
    written = client.written["students.json"]
    assert written["classes"]["2-3"][0]["number"] == 5
    assert written["classes"]["2-3"][0]["name"] == ""


def test_migrate_noop_when_cloud_absent(tmp_path, monkeypatch):
    _patch_path(tmp_path, monkeypatch)
    client = _FakeClient(None)
    assert local_store.migrate_students_from_drive(client) is False
    assert client.written == {}


def test_migrate_does_not_clobber_existing_local(tmp_path, monkeypatch):
    _patch_path(tmp_path, monkeypatch)
    local_store.save_local_students(
        Students(schemaVersion=1, classes={"2-3": [StudentEntry(number=5, name="LOCAL")]})
    )
    client = _FakeClient({"schemaVersion": 1, "classes": {"2-3": [{"number": 5, "name": "CLOUD"}]}})
    assert local_store.migrate_students_from_drive(client) is True
    # local name preserved; cloud still rewritten numbers-only
    assert local_store.load_local_students().classes["2-3"][0].name == "LOCAL"
    assert client.written["students.json"]["classes"]["2-3"][0]["name"] == ""
