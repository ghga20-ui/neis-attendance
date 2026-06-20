import json

from subject_teacher import local_store
from subject_teacher.gui import api as api_mod


def test_students_tsv_round_trips_through_local_store(tmp_path, monkeypatch):
    target = tmp_path / "students.local.json"
    monkeypatch.setattr(local_store, "get_students_path", lambda: target)

    a = api_mod.Api.__new__(api_mod.Api)  # avoid heavy __init__
    monkeypatch.setattr(a, "_clear_slot_cache", lambda: None, raising=False)

    res = json.loads(a.save_students_tsv("class_key\tnumber\tname\n2-3\t5\t김가나"))
    assert res == {"ok": True}
    assert "김가나" in a.get_students_tsv()
    # local file must exist (written via local_store, not Drive)
    assert target.exists()
