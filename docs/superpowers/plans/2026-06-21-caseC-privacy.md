# 학생 개인정보 Case C 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 실명을 Google Drive에서 제거하고 데스크톱 로컬(DPAPI)에만 저장하여 클라우드·모바일이 학번 기반 가명정보만 다루도록 전환(Case D→C)하고, Case C 고지 문서를 제공한다.

**Architecture:** 데스크톱은 명부(이름+번호)를 `%LOCALAPPDATA%\NeisSubject\students.local.json`에 DPAPI 암호화로 저장. Drive 동기화 대상은 `settings/timetable/attendance-*`(전부 학번 기반)로 한정. 모바일 PWA는 이름 없이 번호만 표시. 기존 클라우드 평문 `students.json`은 시작 시 1회 로컬 이전 후 삭제.

**Tech Stack:** Python 3 / pydantic / pywin32(win32crypt DPAPI) / pytest, React+TS(Vite) PWA, Google Drive v3 appDataFolder.

## Global Constraints

- Drive 클라이언트는 스레드 안전하지 않음 — store/migration 호출은 단일 스레드에서만 (`drive-client-not-thread-safe`).
- 로컬 명부 저장은 기존 DPAPI 헬퍼 `subject_teacher/auth/token_store.py`의 `save_token/load_token/delete_token` 재사용. 새 암호화 코드 작성 금지.
- 기존 `Students`/`StudentEntry` 스키마(`subject_teacher/drive/schemas.py`) 재사용. 새 스키마 만들지 않음.
- 테스트·명령은 **repo 루트**(`neis-attendance/`)에서 실행: `python -m pytest ...`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 이름은 어떤 코드 경로로도 Drive/모바일로 전송 금지.

---

# 트랙 A — 코드

### Task A1: 로컬 명부 저장소 (DPAPI)

**Files:**
- Modify: `subject_teacher/paths.py`
- Create: `subject_teacher/local_store.py`
- Test: `tests/test_local_store.py`

**Interfaces:**
- Consumes: `auth/token_store.save_token(path, dict)`, `load_token(path)->dict`, `delete_token(path)`, `TokenNotFoundError`; `drive/schemas.Students`.
- Produces: `local_store.save_local_students(Students)->None`, `load_local_students()->Students|None`, `clear_local_students()->None`; `paths.get_students_path()->Path`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_local_store.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_local_store.py -v`
Expected: FAIL (`ModuleNotFoundError: subject_teacher.local_store`)

- [ ] **Step 3: Add path helper**

```python
# subject_teacher/paths.py  (append)
def get_students_path() -> Path:
    return get_app_data_dir() / "students.local.json"
```

- [ ] **Step 4: Implement local_store**

```python
# subject_teacher/local_store.py
"""DPAPI-backed local storage for the student roster (names never leave the device)."""
from __future__ import annotations

from subject_teacher.auth.token_store import (
    TokenNotFoundError,
    delete_token,
    load_token,
    save_token,
)
from subject_teacher.drive.migrations import migrate
from subject_teacher.drive.schemas import Students
from subject_teacher.paths import get_students_path


def save_local_students(students: Students) -> None:
    save_token(get_students_path(), students.model_dump(by_alias=True, mode="json"))


def load_local_students() -> Students | None:
    try:
        payload = load_token(get_students_path())
    except TokenNotFoundError:
        return None
    return Students.model_validate(migrate(payload))


def clear_local_students() -> None:
    delete_token(get_students_path())
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/test_local_store.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add subject_teacher/paths.py subject_teacher/local_store.py tests/test_local_store.py
git commit -m "feat(privacy): DPAPI-backed local student roster store"
```

---

### Task A2: 클라우드→로컬 마이그레이션 함수

**Files:**
- Modify: `subject_teacher/local_store.py`
- Test: `tests/test_local_store.py`

**Interfaces:**
- Consumes: a Drive client exposing `read_json(name)->dict|None` and `delete(name)->bool` (matches `drive/client.DriveAppDataClient`).
- Produces: `local_store.migrate_students_from_drive(client)->bool` (True if a cloud students.json was migrated+deleted).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_local_store.py  (append)
class _FakeClient:
    def __init__(self, raw):
        self.raw = raw
        self.deleted = []

    def read_json(self, name):
        return self.raw if name == "students.json" else None

    def delete(self, name):
        self.deleted.append(name)
        return True


def test_migrate_pulls_then_deletes(tmp_path, monkeypatch):
    _patch_path(tmp_path, monkeypatch)
    client = _FakeClient({"schemaVersion": 1, "classes": {"2-3": [{"number": 5, "name": "김가나"}]}})
    assert local_store.migrate_students_from_drive(client) is True
    assert local_store.load_local_students().classes["2-3"][0].name == "김가나"
    assert client.deleted == ["students.json"]


def test_migrate_noop_when_cloud_absent(tmp_path, monkeypatch):
    _patch_path(tmp_path, monkeypatch)
    client = _FakeClient(None)
    assert local_store.migrate_students_from_drive(client) is False
    assert client.deleted == []


def test_migrate_does_not_clobber_existing_local(tmp_path, monkeypatch):
    _patch_path(tmp_path, monkeypatch)
    local_store.save_local_students(
        Students(schemaVersion=1, classes={"2-3": [StudentEntry(number=5, name="LOCAL")]})
    )
    client = _FakeClient({"schemaVersion": 1, "classes": {"2-3": [{"number": 5, "name": "CLOUD"}]}})
    assert local_store.migrate_students_from_drive(client) is True
    # local wins; cloud copy still deleted
    assert local_store.load_local_students().classes["2-3"][0].name == "LOCAL"
    assert client.deleted == ["students.json"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_local_store.py -k migrate -v`
Expected: FAIL (`AttributeError: ... migrate_students_from_drive`)

- [ ] **Step 3: Implement migration**

```python
# subject_teacher/local_store.py  (append)
def migrate_students_from_drive(client) -> bool:
    """One-time: pull plaintext students.json off Drive into local storage, then delete it.

    Idempotent: returns False when no cloud students.json exists. Never overwrites an
    existing local roster (local is the source of truth once migrated).
    """
    raw = client.read_json("students.json")
    if raw is None:
        return False
    if load_local_students() is None:
        save_local_students(Students.model_validate(migrate(raw)))
    client.delete("students.json")
    return True
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_local_store.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add subject_teacher/local_store.py tests/test_local_store.py
git commit -m "feat(privacy): migrate cloud students.json to local store then delete"
```

---

### Task A3: build_store에서 마이그레이션 1회 실행

**Files:**
- Modify: `subject_teacher/state.py:64-66` (`build_store`)

**Interfaces:**
- Consumes: `local_store.migrate_students_from_drive`.
- Produces: unchanged `build_store()->DriveStore` signature; side-effect: runs migration once per process.

- [ ] **Step 1: Replace build_store**

```python
# subject_teacher/state.py  (replace existing build_store at lines 64-66)
_students_migrated = False


def build_store() -> DriveStore:
    global _students_migrated
    credentials = get_credentials()
    client = DriveAppDataClient(credentials=credentials)
    if not _students_migrated:
        try:
            from subject_teacher.local_store import migrate_students_from_drive

            migrate_students_from_drive(client)
        except Exception:
            pass  # never block startup on migration
        _students_migrated = True
    return DriveStore(client)
```

- [ ] **Step 2: Run full suite to confirm no regression**

Run: `python -m pytest tests/test_subject_teacher_state.py -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add subject_teacher/state.py
git commit -m "feat(privacy): run student migration once when building Drive store"
```

---

### Task A4: 데스크톱 API를 로컬 명부로 전환 + 스냅샷에서 이름 제거

**Files:**
- Modify: `subject_teacher/gui/api.py` (`save_students_tsv` ~592, `get_students_tsv` ~583, `get_mobile_snapshot` ~667)
- Test: `tests/test_app_service.py` (or a new `tests/test_api_students.py`)

**Interfaces:**
- Consumes: `local_store.save_local_students/load_local_students`, `state.parse_students_tsv/serialize_students_tsv`.
- Produces: `save_students_tsv`/`get_students_tsv` now read/write local roster; `get_mobile_snapshot` JSON no longer contains a `students` key.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_api_students.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_api_students.py -v`
Expected: FAIL (current code calls `store.save_students`, needs a Drive client → error or wrong path)

- [ ] **Step 3: Edit `save_students_tsv`**

```python
# subject_teacher/gui/api.py  — replace body of save_students_tsv
    def save_students_tsv(self, tsv: str) -> str:
        try:
            from subject_teacher.local_store import save_local_students

            students = parse_students_tsv(tsv)
            save_local_students(students)
            self._clear_slot_cache()
            return json.dumps({"ok": True})
        except Exception as exc:
            return _json_error(exc)
```

- [ ] **Step 4: Edit `get_students_tsv`**

```python
# subject_teacher/gui/api.py  — replace body of get_students_tsv
    def get_students_tsv(self) -> str:
        try:
            from subject_teacher.local_store import load_local_students

            return serialize_students_tsv(load_local_students())
        except Exception as exc:
            logger.exception("get_students_tsv failed")
            return _json_error(exc)
```

- [ ] **Step 5: Remove names from `get_mobile_snapshot`**

In `get_mobile_snapshot` (~667-694): delete the `students = store.load_students() or ...` block and remove the `"students": students.model_dump(...)` line from the returned dict. Mobile no longer receives names.

- [ ] **Step 6: Verify no name path remains in snapshot**

Run: `python -m pytest tests/test_api_students.py -v`
Expected: PASS
Run: `git grep -n "load_students\|\"students\"" subject_teacher/gui/api.py`
Expected: no remaining references to Drive `load_students` or a `students` snapshot key.

- [ ] **Step 7: Commit**

```bash
git add subject_teacher/gui/api.py tests/test_api_students.py
git commit -m "feat(privacy): desktop reads/writes roster locally; drop names from mobile snapshot"
```

---

### Task A5: Drive 계층에서 학생 명부 API 제거

**Files:**
- Modify: `subject_teacher/drive/store.py` (remove `STUDENTS` const + `load_students`/`save_students`, lines ~11-13 and ~41-51)
- Modify: `tests/test_drive_store.py` (remove students test cases)
- Modify: `subject_teacher/drive/__init__.py` if it re-exports those (check)

**Interfaces:**
- Produces: `DriveStore` no longer exposes `STUDENTS`, `load_students`, `save_students`. `Students`/`StudentEntry` remain in `schemas.py` (used by local_store).

- [ ] **Step 1: Remove from store.py**

Delete the `STUDENTS = "students.json"` line and the `load_students`/`save_students` methods. Remove the now-unused `Students` import in store.py only if no longer referenced there.

- [ ] **Step 2: Remove students cases from tests**

In `tests/test_drive_store.py`, delete any test function that calls `save_students`/`load_students` or references `STUDENTS`.

- [ ] **Step 3: Run suite**

Run: `python -m pytest tests/test_drive_store.py -v`
Expected: PASS (students cases gone)
Run: `git grep -n "save_students\|load_students\|DriveStore.STUDENTS\|\.STUDENTS" subject_teacher tests`
Expected: only `local_store`/`state`-side `*_local_students` matches; no Drive `*_students`.

- [ ] **Step 4: Commit**

```bash
git add subject_teacher/drive/store.py tests/test_drive_store.py
git commit -m "refactor(privacy): drop student roster from Drive store (names are local-only)"
```

---

### Task A6: PWA — 번호만 표시

**Files:**
- Modify: `subject_teacher_pwa/src/lib/driveData.ts` (remove `loadStudents`, drop `students` from `loadAll`/`LoadedDriveData`)
- Modify: `subject_teacher_pwa/src/App.tsx` (render number instead of name)
- Modify: `subject_teacher_pwa/src/lib/schemas.ts` (optional: drop unused `Students`/`StudentEntry`)

**Interfaces:**
- Produces: PWA never reads `students.json`; attendance rows render as `${number}번`.

- [ ] **Step 1: Remove students from driveData**

In `driveData.ts`: delete `loadStudents`; remove `students` from `FILE_NAMES`, `LoadedDriveData`, and the `loadAll` Promise.all + return.

- [ ] **Step 2: Locate name rendering**

Run: `git grep -n "\.name\|students\|StudentEntry" subject_teacher_pwa/src/App.tsx`
For each place a student name is displayed, replace with the student number rendered as `{number}번` (numbers come from attendance `student_number` / roster numbers already present in slots).

- [ ] **Step 3: Typecheck + build**

Run: `cd subject_teacher_pwa && npm run build`
Expected: build succeeds, no TS errors referencing removed `students`/`loadStudents`.

- [ ] **Step 4: Commit**

```bash
git add subject_teacher_pwa/src/lib/driveData.ts subject_teacher_pwa/src/App.tsx subject_teacher_pwa/src/lib/schemas.ts
git commit -m "feat(privacy): PWA shows student numbers only, stops reading cloud roster"
```

---

### Task A7: 출결 사유(note) 이름 입력 가드

**Files:**
- Modify: attendance note input UI (desktop run tab and/or PWA). Locate via `git grep -n "note" subject_teacher/gui subject_teacher_pwa/src`.

**Interfaces:**
- Produces: note input shows helper text "이름 대신 학번/사유만 입력하세요". (Soft guard, no hard validation.)

- [ ] **Step 1: Add helper text to the note input(s)**

Add a placeholder/hint string "이름 대신 사유만 입력 (학번으로 식별됩니다)" to the absence-note input field(s) found above.

- [ ] **Step 2: Verify build/render**

Run: `cd subject_teacher_pwa && npm run build` (if PWA touched). Desktop: `python -m pytest -q` smoke.
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(privacy): hint users not to put names in absence notes"
```

---

# 트랙 B — 문서 / 고지

### Task B1: 개인정보 처리방침

**Files:**
- Create: `docs/legal/privacy-policy.md`

- [ ] **Step 1: Write the policy**

Sections (한국어, 실제 내용 채움):
1. 처리하는 개인정보 항목: 학번, 출결(결석/지각/사유), 시간표, 교사 이름, 학교명.
2. **학생 이름은 교사 데스크톱 기기 로컬에만 저장되며 외부(클라우드/모바일)로 전송되지 않습니다.**
3. 처리 목적: 출결 입력 자동화 및 모바일↔데스크톱 동기화.
4. 보유·이용 기간: 학기/학년도 종료 후 파기(구체 기간 명시), 즉시 삭제 요청 가능.
5. 처리위탁: 수탁자 Google LLC (클라우드 저장, Drive appDataFolder).
6. 국외이전(§28-8) — ①이전받는 자: Google LLC ②국가: 미국 ③항목: 학번·출결·시간표·교사명·학교명 ④시점·방법: 저장 시 HTTPS 전송 ⑤목적: 동기화 저장 ⑥보유기간: 위 4와 동일 ⑦거부 권리·방법: 클라우드 동기화 미사용 시 거부 가능.
7. 정보주체 권리: 열람·정정·삭제·처리정지 요청 경로(연락처).
8. 안전성 확보조치: 전송/저장 암호화(HTTPS, Drive 서버측 암호화), 로컬 명부 DPAPI 암호화.

- [ ] **Step 2: Commit**

```bash
git add docs/legal/privacy-policy.md
git commit -m "docs(privacy): add privacy policy (names local-only, Drive overseas transfer notice)"
```

---

### Task B2: 보호자 고지·동의서 양식

**Files:**
- Create: `docs/legal/guardian-consent-template.md`

- [ ] **Step 1: Write the template**

가정통신문 형식, 빈칸([학교명],[학급],[기간])과 함께:
- 수집·이용 항목/목적/보유기간 (학번·출결, 위 처리방침과 일치)
- 클라우드(국외) 저장 사실 + 이전 7항목 요약, **학생 이름 미전송** 명시
- 만 14세 미만: 법정대리인 동의란(서명/날짜)
- 동의/미동의 선택란, 미동의 시 대안(수기 처리) 안내

- [ ] **Step 2: Commit**

```bash
git add docs/legal/guardian-consent-template.md
git commit -m "docs(privacy): add guardian notice/consent template (under-14 legal guardian)"
```

---

### Task B3: 인앱 고지 (처리방침 표시 + 최초 1회 안내)

**Files:**
- Modify: 데스크톱 설정/about 화면 (locate via `git grep -n "about\|설정\|version" subject_teacher/gui`), PWA 푸터(`subject_teacher_pwa/src/App.tsx`)
- Use content from `docs/legal/privacy-policy.md`

- [ ] **Step 1: Desktop — show policy + first-run notice**

설정/about 화면에 "개인정보 처리방침" 링크/뷰 추가(privacy-policy.md 내용 렌더 또는 외부 링크). 최초 1회 모달: "이 앱은 학생 개인정보(학번·출결)를 처리합니다. 학교 동의 절차 완료를 확인하세요" + 처리방침 링크 + 확인 체크박스(로컬 플래그로 1회만).

- [ ] **Step 2: PWA — footer policy link**

`App.tsx` 하단에 "개인정보 처리방침" 링크 추가(정책 페이지/모달).

- [ ] **Step 3: Verify**

Run: `cd subject_teacher_pwa && npm run build`; 데스크톱 수동 실행으로 모달 1회 표시 확인.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(privacy): in-app privacy policy link and first-run notice"
```

---

### Task B4: (선택) 학운위 심의 요약

**Files:**
- Create: `docs/legal/school-board-summary.md`

- [ ] **Step 1: Write 1-page summary**

SW 개요, 수집항목(학번·출결), 전송 범위(클라우드=가명 학번, **이름 미전송**), 근거(초중등교육법 §29-2②, 개인정보보호법 §26/§28-8), 보안조치 요약.

- [ ] **Step 2: Commit**

```bash
git add docs/legal/school-board-summary.md
git commit -m "docs(privacy): add school-board review one-pager"
```

---

## Self-Review (작성자 체크)

- **Spec 커버리지**: §5.1→A1, §5.4→A2/A3, §5.2→A4, §5.3→A5, §5.5→A6, §5.6→A7, §6.1→B1/B3, §6.3→B2, §6.2→B3, §6.4→B4. 전 항목 매핑됨.
- **플레이스홀더**: 코드 태스크(A1~A5)는 실제 코드/테스트 포함. UI(A6/A7/B3)·문서(B1/B2/B4)는 파일을 못 읽고 작성하는 부분이라 "grep로 위치 → 변환" 지시로 구체화(추상 TODO 아님).
- **타입 일관성**: `save_local_students/load_local_students/clear_local_students/migrate_students_from_drive`, `get_students_path` 명칭 전 태스크 일치. `Students.model_dump(by_alias=True, mode="json")` ↔ `Students.model_validate(migrate(...))` 라운드트립 일치.
- **순서**: A1→A2→A3→A4→A5→A6→A7, B는 독립(병렬 가능). A4는 A1 의존, A3는 A2 의존.
