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
