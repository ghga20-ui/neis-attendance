import pytest
from urllib.error import URLError

from subject_teacher.neis_open_api import (
    NeisOpenApiError,
    _fetch_json,
    query_subject_candidates,
    query_class_timetable,
    subject_matches,
)


def test_subject_matching_normalizes_arabic_and_roman_numerals():
    assert subject_matches("수학Ⅰ", ["수학1"]) is True
    assert subject_matches("수학 I", ["수학1"]) is True
    assert subject_matches("영어Ⅱ", ["영어2"]) is True
    assert subject_matches("문학", ["독서"]) is False


def test_subject_matching_uses_teacher_aliases():
    assert subject_matches("문학과 매체", ["문학"], aliases=["문학과매체"]) is True


def test_query_class_timetable_maps_high_school_rows_to_preview_lessons():
    calls = []

    def fake_fetch(endpoint, params):
        calls.append((endpoint, params))
        if endpoint == "schoolInfo":
            return {
                "schoolInfo": [
                    {"head": [{"list_total_count": 1}]},
                    {
                        "row": [
                            {
                                "ATPT_OFCDC_SC_CODE": "J10",
                                "SD_SCHUL_CODE": "7530174",
                                "SCHUL_NM": "수원고등학교",
                                "SCHUL_KND_SC_NM": "고등학교",
                            }
                        ]
                    },
                ]
            }
        if endpoint == "hisTimetable":
            assert params["ATPT_OFCDC_SC_CODE"] == "J10"
            assert params["SD_SCHUL_CODE"] == "7530174"
            assert params["ALL_TI_YMD"] == "20250310"
            assert params["GRADE"] == "2"
            assert params["CLASS_NM"] == "1"
            return {
                "hisTimetable": [
                    {"head": [{"list_total_count": 2}]},
                    {
                        "row": [
                            {"GRADE": "2", "CLASS_NM": "1", "PERIO": "3", "ITRT_CNTNT": "문학"},
                            {"GRADE": "2", "CLASS_NM": "1", "PERIO": "4", "ITRT_CNTNT": "수학Ⅰ"},
                        ]
                    },
                ]
            }
        raise AssertionError(endpoint)

    result = query_class_timetable(
        region="경기",
        school_name="수원고",
        date_str="2025-03-10",
        grade=2,
        class_no="1",
        fetch_json=fake_fetch,
    )

    assert calls[0][0] == "schoolInfo"
    assert calls[1][0] == "hisTimetable"
    assert result["school"]["name"] == "수원고등학교"
    assert result["lessons"] == [
        {"day": "월", "period": 3, "grade": 2, "classNo": "1", "subject": "문학", "neis": "문학"},
        {"day": "월", "period": 4, "grade": 2, "classNo": "1", "subject": "수학Ⅰ", "neis": "수학Ⅰ"},
    ]


def test_fetch_json_falls_back_to_http_after_ssl_wrong_version(monkeypatch):
    calls = []

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return b'{"ok": true}'

    def fake_urlopen(url, timeout):
        calls.append(url)
        if url.startswith("https://"):
            raise URLError("[SSL: WRONG_VERSION_NUMBER] wrong version number")
        return FakeResponse()

    monkeypatch.setattr("subject_teacher.neis_open_api.urlopen", fake_urlopen)

    assert _fetch_json("schoolInfo", {"Type": "json"}) == {"ok": True}
    assert calls == [
        "https://open.neis.go.kr/hub/schoolInfo?Type=json",
        "https://open.neis.go.kr/hub/schoolInfo?Type=json",
        "http://open.neis.go.kr/hub/schoolInfo?Type=json",
    ]


def test_fetch_json_falls_back_to_http_after_ssl_bad_record_mac(monkeypatch):
    calls = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return b'{"ok": true}'

    def fake_urlopen(url, timeout):
        calls.append(url)
        if url.startswith("https://"):
            raise URLError("[SSL: DECRYPTION_FAILED_OR_BAD_RECORD_MAC] decryption failed or bad record mac")
        return FakeResponse()

    monkeypatch.setattr("subject_teacher.neis_open_api.urlopen", fake_urlopen)

    assert _fetch_json("schoolInfo", {"Type": "json"}) == {"ok": True}
    assert calls[-1] == "http://open.neis.go.kr/hub/schoolInfo?Type=json"


def test_query_class_timetable_reuses_school_cache_across_calls():
    schoolinfo_calls = []
    timetable_calls = []

    def fake_fetch(endpoint, params):
        if endpoint == "schoolInfo":
            schoolinfo_calls.append(params)
            return {
                "schoolInfo": [
                    {"head": [{"list_total_count": 1}]},
                    {
                        "row": [
                            {
                                "ATPT_OFCDC_SC_CODE": "J10",
                                "SD_SCHUL_CODE": "7530174",
                                "SCHUL_NM": "수원고등학교",
                                "SCHUL_KND_SC_NM": "고등학교",
                            }
                        ]
                    },
                ]
            }
        if endpoint == "hisTimetable":
            timetable_calls.append(params)
            return {"hisTimetable": [{"head": []}, {"row": []}]}
        raise AssertionError(endpoint)

    cache: dict = {}
    for date_str in ("2025-03-10", "2025-03-11", "2025-03-12"):
        query_class_timetable(
            region="경기",
            school_name="수원고",
            date_str=date_str,
            grade=2,
            class_no="1",
            fetch_json=fake_fetch,
            school_cache=cache,
        )

    # schoolInfo resolved once and reused; only the per-date timetable repeats.
    assert len(schoolinfo_calls) == 1
    assert len(timetable_calls) == 3


def test_query_class_timetable_raises_when_school_is_not_found():
    def fake_fetch(endpoint, params):
        return {"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}}

    with pytest.raises(NeisOpenApiError, match="학교를 찾을 수 없습니다"):
        query_class_timetable(
            region="경기",
            school_name="없는학교",
            date_str="2025-03-10",
            grade=2,
            class_no="1",
            fetch_json=fake_fetch,
        )


def test_query_subject_candidates_uses_grade_scope_and_filters_similar_subjects():
    calls = []

    def fake_fetch(endpoint, params):
        calls.append((endpoint, params))
        if endpoint == "schoolInfo":
            return {
                "schoolInfo": [
                    {"head": [{"list_total_count": 1}]},
                    {
                        "row": [
                            {
                                "ATPT_OFCDC_SC_CODE": "J10",
                                "SD_SCHUL_CODE": "7530174",
                                "SCHUL_NM": "수원고등학교",
                                "SCHUL_KND_SC_NM": "고등학교",
                            }
                        ]
                    },
                ]
            }
        if endpoint == "hisTimetable":
            assert "CLASS_NM" not in params
            return {
                "hisTimetable": [
                    {"head": [{"list_total_count": 3}]},
                    {
                        "row": [
                            {"GRADE": "1", "CLASS_NM": "1", "PERIO": "1", "ITRT_CNTNT": "공통국어Ⅰ"},
                            {"GRADE": "1", "CLASS_NM": "2", "PERIO": "2", "ITRT_CNTNT": "공통 국어 1"},
                            {"GRADE": "1", "CLASS_NM": "3", "PERIO": "3", "ITRT_CNTNT": "통합사회"},
                        ]
                    },
                ]
            }
        raise AssertionError(endpoint)

    result = query_subject_candidates(
        region="경기",
        school_name="수원고",
        date_str="2026-05-06",
        grade=1,
        class_no="1",
        subject_name="공통국어1",
        fetch_json=fake_fetch,
    )

    assert result["scope"] == "grade"
    assert [candidate["subject"] for candidate in result["candidates"]] == ["공통국어Ⅰ", "공통 국어 1"]


def test_query_subject_candidates_falls_back_to_class_scope_when_grade_scope_is_empty():
    timetable_calls = []

    def fake_fetch(endpoint, params):
        if endpoint == "schoolInfo":
            return {
                "schoolInfo": [
                    {"head": [{"list_total_count": 1}]},
                    {
                        "row": [
                            {
                                "ATPT_OFCDC_SC_CODE": "J10",
                                "SD_SCHUL_CODE": "7530174",
                                "SCHUL_NM": "수원고등학교",
                                "SCHUL_KND_SC_NM": "고등학교",
                            }
                        ]
                    },
                ]
            }
        if endpoint == "hisTimetable":
            timetable_calls.append(params)
            if "CLASS_NM" not in params:
                return {"RESULT": {"CODE": "INFO-200", "MESSAGE": "데이터 없음"}}
            return {
                "hisTimetable": [
                    {"head": [{"list_total_count": 1}]},
                    {
                        "row": [
                            {"GRADE": "2", "CLASS_NM": "1", "PERIO": "3", "ITRT_CNTNT": "문학"},
                            {"GRADE": "2", "CLASS_NM": "1", "PERIO": "4", "ITRT_CNTNT": "기하"},
                        ]
                    },
                ]
            }
        raise AssertionError(endpoint)

    result = query_subject_candidates(
        region="경기",
        school_name="수원고",
        date_str="2026-05-06",
        grade=2,
        class_no="1",
        subject_name="문학",
        fetch_json=fake_fetch,
    )

    assert result["scope"] == "class"
    assert any(call.get("CLASS_NM") == "1" for call in timetable_calls)
    assert [candidate["subject"] for candidate in result["candidates"]] == ["문학"]
