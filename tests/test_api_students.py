import json

from subject_teacher import local_store
from subject_teacher.gui import api as api_mod


def test_save_students_tsv_writes_full_local_and_numbers_to_drive(tmp_path, monkeypatch):
    target = tmp_path / "students.local.json"
    monkeypatch.setattr(local_store, "get_students_path", lambda: target)

    a = api_mod.Api.__new__(api_mod.Api)  # avoid heavy __init__
    monkeypatch.setattr(a, "_clear_slot_cache", lambda: None, raising=False)

    captured = {}

    class _FakeStore:
        def save_students(self, students):
            captured["students"] = students

    monkeypatch.setattr(a, "_store", lambda: _FakeStore(), raising=False)

    res = json.loads(a.save_students_tsv("class_key\tnumber\tname\n2-3\t5\t김가나"))
    assert res == {"ok": True}
    # local keeps the full name
    assert target.exists()
    assert "김가나" in a.get_students_tsv()
    # Drive received the roster (store.save_students strips names itself, tested in C1)
    assert captured["students"].classes["2-3"][0].number == 5
