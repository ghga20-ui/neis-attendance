# pywebview GUI 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코덱스가 만든 CustomTkinter GUI(`gui/app.py`)를 pywebview + 기존 React/HTML 디자인(`neis_attendance/`)으로 교체하여 배포 가능한 데스크탑 앱 완성

**Architecture:** `webview_app.py`가 새 진입점. pywebview가 `neis_attendance/index.html`을 네이티브 창에 띄우고, `Api` 클래스가 JS에 노출됨. JS → Python은 `window.pywebview.api.*()` (Promise), Python → JS는 `window.evaluate_js('window.__pushLog(...)')` 패턴으로 실시간 로그 스트리밍. 기존 `app_service.py`, `state.py`, `neis/`, `drive/`, `auth/` 백엔드는 **그대로 유지**.

**Tech Stack:** Python 3.x, pywebview 4.x, React 18 (CDN via unpkg), Babel Standalone, 기존 Selenium/win32com/Google Drive 백엔드

---

## 파일 구조

| 동작 | 경로 | 역할 |
|---|---|---|
| **생성** | `subject_teacher/gui/webview_app.py` | pywebview 창 생성, Api 인스턴스화, 앱 시작 |
| **생성** | `subject_teacher/gui/api.py` | JS에 노출되는 Python API 클래스 |
| **수정** | `subject_teacher/main.py` | CustomTkinter 대신 webview_app 호출 |
| **수정** | `requirements.txt` | `pywebview>=4.4` 추가 |
| **수정** | `neis_attendance/index.html` | `bridge.js` 스크립트 태그 추가 |
| **생성** | `neis_attendance/bridge.js` | JS 측 브리지: `__pushLog`, `__initData` 수신 |
| **수정** | `neis_attendance/app.jsx` | pywebview 감지 후 실제 API 호출로 전환 |
| **수정** | `neis_attendance/run-view.jsx` | startRun이 `window.pywebview.api.start_run()` 호출 |

---

### Task 1: pywebview 의존성 추가

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: requirements.txt에 pywebview 추가**

```text
pywebview>=4.4
```

`customtkinter` 줄 아래에 추가:

```
customtkinter
CTkMessagebox
pywebview>=4.4
selenium
...
```

- [ ] **Step 2: 설치 확인**

```bash
pip install pywebview
python -c "import webview; print(webview.__version__)"
```

Expected: 버전 숫자 출력 (예: `4.4.1`)

- [ ] **Step 3: 커밋**

```bash
git add requirements.txt
git commit -m "feat: add pywebview dependency"
```

---

### Task 2: webview_app.py — 창 띄우기 골격

**Files:**
- Create: `subject_teacher/gui/webview_app.py`

- [ ] **Step 1: webview_app.py 생성**

```python
"""pywebview-based desktop window for subject_teacher."""
from __future__ import annotations

import os
import webview

from subject_teacher.gui.api import Api


def _html_path() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "..", "neis_attendance", "index.html")


def start() -> None:
    api = Api()
    window = webview.create_window(
        title="나이스 출결관리 프로 · 교과교사용",
        url=f"file://{_html_path()}",
        js_api=api,
        width=1440,
        height=900,
        min_size=(1200, 800),
        background_color="#F2F2F7",
    )
    api.set_window(window)
    webview.start(debug=False)
```

- [ ] **Step 2: 실행 확인 (api.py 없이는 실패 — 다음 Task 완료 후 다시 확인)**

---

### Task 3: api.py — Python API 클래스

**Files:**
- Create: `subject_teacher/gui/api.py`

- [ ] **Step 1: api.py 생성**

```python
"""Python API exposed to the pywebview JS frontend."""
from __future__ import annotations

import json
import logging
import threading
from datetime import date as date_type

from subject_teacher.app_service import run_day
from subject_teacher.state import (
    build_store,
    load_local_password,
    save_local_password,
    summarize_day,
    serialize_timetable_tsv,
    parse_timetable_tsv,
    serialize_students_tsv,
    parse_students_tsv,
    default_settings,
)

logger = logging.getLogger(__name__)


class Api:
    def __init__(self) -> None:
        self._window = None

    def set_window(self, window) -> None:
        self._window = window

    # ── helpers ──────────────────────────────────────────────────────────────

    def _push_log(self, level: str, msg: str) -> None:
        if self._window is None:
            return
        payload = json.dumps({"lv": level, "msg": msg})
        self._window.evaluate_js(
            f"window.__pushLog && window.__pushLog({payload})"
        )

    def _push_progress(self, done: int, total: int, current: str, state: str) -> None:
        if self._window is None:
            return
        payload = json.dumps({"done": done, "total": total, "current": current, "state": state})
        self._window.evaluate_js(
            f"window.__pushProgress && window.__pushProgress({payload})"
        )

    # ── 패스워드 ──────────────────────────────────────────────────────────────

    def get_password(self) -> str:
        return load_local_password()

    def save_password(self, password: str) -> None:
        save_local_password(password)

    # ── 설정 ─────────────────────────────────────────────────────────────────

    def get_settings(self) -> str:
        try:
            store = build_store()
            settings = store.load_settings()
            if settings is None:
                return json.dumps({"error": "settings.json 없음"})
            return settings.model_dump_json()
        except Exception as exc:
            logger.exception("get_settings failed")
            return json.dumps({"error": str(exc)})

    def save_settings(self, payload: str) -> str:
        try:
            from subject_teacher.drive.schemas import Settings
            store = build_store()
            settings = Settings.model_validate_json(payload)
            store.save_settings(settings)
            return json.dumps({"ok": True})
        except Exception as exc:
            logger.exception("save_settings failed")
            return json.dumps({"error": str(exc)})

    # ── 시간표 ────────────────────────────────────────────────────────────────

    def get_timetable_tsv(self) -> str:
        try:
            store = build_store()
            timetable = store.load_timetable()
            return serialize_timetable_tsv(timetable)
        except Exception as exc:
            return f"ERROR: {exc}"

    def save_timetable_tsv(self, tsv: str, effective_from: str) -> str:
        try:
            store = build_store()
            timetable = parse_timetable_tsv(tsv, effective_from)
            store.save_timetable(timetable)
            return json.dumps({"ok": True})
        except Exception as exc:
            return json.dumps({"error": str(exc)})

    # ── 학생 명부 ─────────────────────────────────────────────────────────────

    def get_students_tsv(self) -> str:
        try:
            students = load_local_students()
            return serialize_students_tsv(students)
        except Exception as exc:
            return f"ERROR: {exc}"

    def save_students_tsv(self, tsv: str) -> str:
        try:
            students = parse_students_tsv(tsv)
            save_local_students(students)
            return json.dumps({"ok": True})
        except Exception as exc:
            return json.dumps({"error": str(exc)})

    # ── 오늘 수업 슬롯 ────────────────────────────────────────────────────────

    def get_today_slots(self, date_str: str) -> str:
        try:
            store = build_store()
            summaries = summarize_day(store, date_str)
            result = [
                {
                    "id": s.slot_id,
                    "period": s.period,
                    "grade": s.grade,
                    "classNo": str(s.class_no),
                    "subject": s.subject_name,
                    "checked": s.checked,
                    "absences": s.absence_count,
                    "synced": s.synced_to_neis,
                    "closed": s.closed_on_neis,
                }
                for s in summaries
            ]
            return json.dumps(result)
        except Exception as exc:
            logger.exception("get_today_slots failed")
            return json.dumps({"error": str(exc)})

    # ── NEIS 실행 ─────────────────────────────────────────────────────────────

    def start_run(self, date_str: str, password: str, close_after: bool) -> None:
        """JS가 호출하면 백그라운드 스레드에서 실행 후 로그를 스트리밍한다."""
        def _worker() -> None:
            try:
                self._push_log("INFO", f"NEIS 반영 시작 — {date_str}")
                self._push_progress(0, 0, "", "running")
                results = run_day(date_str, password, bool(close_after))
                total = len(results)
                for i, r in enumerate(results, 1):
                    if r.status == "ok":
                        self._push_log("OK", f"✓ {r.slot_id} 반영됨")
                    elif r.status == "skipped":
                        self._push_log("INFO", f"→ {r.slot_id} 건너뜀 (이미 반영)")
                    else:
                        self._push_log("ERR", f"✗ {r.slot_id} 실패: {r.error}")
                    self._push_progress(i, total, r.slot_id, "running")
                self._push_progress(total, total, "", "done")
                self._push_log("OK", f"실행 완료 — {total}건 처리됨")
            except Exception as exc:
                logger.exception("start_run worker failed")
                self._push_log("ERR", f"실행 오류: {exc}")
                self._push_progress(0, 0, "", "error")

        threading.Thread(target=_worker, daemon=True).start()
```

- [ ] **Step 2: 창 띄우기 확인**

```bash
cd /c/Users/admin/Desktop/2026_project/neis-attendance
python -c "from subject_teacher.gui.webview_app import start; start()"
```

Expected: 1440×900 창이 열리고 `neis_attendance/index.html` UI가 표시됨

- [ ] **Step 3: 커밋**

```bash
git add subject_teacher/gui/api.py subject_teacher/gui/webview_app.py
git commit -m "feat: add pywebview Api class and window launcher"
```

---

### Task 4: main.py 수정 — CustomTkinter 대신 webview 사용

**Files:**
- Modify: `subject_teacher/main.py`

- [ ] **Step 1: main.py 수정**

```python
from __future__ import annotations

from subject_teacher.gui.webview_app import start


def main() -> None:
    start()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행 확인**

```bash
python -m subject_teacher.main
```

Expected: pywebview 창이 열리고 React UI가 표시됨

- [ ] **Step 3: 커밋**

```bash
git add subject_teacher/main.py
git commit -m "feat: switch main entry point from CustomTkinter to pywebview"
```

---

### Task 5: bridge.js — JS 측 브리지 함수 정의

**Files:**
- Create: `neis_attendance/bridge.js`
- Modify: `neis_attendance/index.html`

- [ ] **Step 1: bridge.js 생성**

```javascript
/* bridge.js — pywebview ↔ React 브리지
 * Python이 window.__pushLog / window.__pushProgress 를 evaluate_js로 호출한다.
 * React 앱이 마운트된 후 window.__registerBridge()로 콜백을 등록한다.
 */

window.__logCallbacks = [];
window.__progressCallbacks = [];

window.__pushLog = function (entry) {
  window.__logCallbacks.forEach(function (cb) { cb(entry); });
};

window.__pushProgress = function (progress) {
  window.__progressCallbacks.forEach(function (cb) { cb(progress); });
};

window.__registerBridge = function (onLog, onProgress) {
  window.__logCallbacks.push(onLog);
  window.__progressCallbacks.push(onProgress);
};

window.__isPywebview = function () {
  return typeof window.pywebview !== "undefined";
};
```

- [ ] **Step 2: index.html에 bridge.js 추가 (babel scripts보다 먼저)**

`index.html` 의 `<body>` 안 첫 번째 `<script>` 태그 위에 추가:

```html
<script src="bridge.js"></script>
```

완성된 body 순서:
```html
<body>
<div id="root"></div>
<script src="bridge.js"></script>
<script type="text/babel" src="tweaks-panel.jsx"></script>
<script type="text/babel" src="components.jsx"></script>
<script type="text/babel" src="data.jsx"></script>
<script type="text/babel" src="log-panel.jsx"></script>
<script type="text/babel" src="run-view.jsx"></script>
<script type="text/babel" src="setup-view.jsx"></script>
<script type="text/babel" src="app.jsx"></script>
</body>
```

- [ ] **Step 3: 커밋**

```bash
git add neis_attendance/bridge.js neis_attendance/index.html
git commit -m "feat: add JS bridge for pywebview communication"
```

---

### Task 6: app.jsx 수정 — pywebview 감지 및 실시간 로그 연결

**Files:**
- Modify: `neis_attendance/app.jsx`

- [ ] **Step 1: app.jsx의 App 컴포넌트에 bridge 등록 useEffect 추가**

`App()` 함수 안의 기존 `useEffect` (theme 적용) 위에 다음 추가:

```javascript
/* Bridge: Python → React 로그/진행상황 수신 */
useEffect(() => {
  if (typeof window.__registerBridge === "function") {
    window.__registerBridge(
      (entry) => setLogLines(l => [...l, { ts: now(), lv: entry.lv, msg: entry.msg }]),
      (p) => {
        setProgress({ done: p.done, total: p.total, current: p.current, state: p.state });
        if (p.state === "done" || p.state === "error") setRunning(false);
      }
    );
  }
}, []);
```

- [ ] **Step 2: startRun 함수 수정 — pywebview 감지 시 실제 API 호출**

기존 `startRun` 함수를 다음으로 교체:

```javascript
const startRun = () => {
  const pending = slots.filter(s => !s.synced);
  if (!pending.length) { appendLog("INFO", "모든 수업이 이미 반영됨"); return; }

  /* pywebview 환경이면 Python 백엔드 호출 */
  if (window.__isPywebview && window.__isPywebview()) {
    setRunning(true);
    setProgress({ done: 0, total: pending.length, current: "", state: "running" });
    appendLog("INFO", `NEIS 반영 실행 — 대상 ${pending.length}건`);
    window.pywebview.api.start_run(date, password, closeAfter);
    return;
  }

  /* 브라우저 미리보기용 mock 실행 */
  setRunning(true);
  setProgress({ done: 0, total: pending.length, current: pending[0] ? `${pending[0].grade}-${pending[0].classNo} ${pending[0].subject}` : "", state: "running" });
  appendLog("INFO", `NEIS 반영 실행 — 대상 ${pending.length}건`);
  let i = 0;
  const tick = () => {
    if (i >= pending.length) {
      setRunning(false);
      setProgress(p => ({ ...p, current: "", state: "done" }));
      appendLog("OK", `실행 완료 — ${pending.length}건 반영${closeAfter ? ", 출결마감" : ""}`);
      return;
    }
    const cur = pending[i];
    setProgress({ done: i, total: pending.length, current: `${cur.grade}-${cur.classNo} ${cur.subject}`, state: "running" });
    appendLog("INFO", `→ ${cur.grade}-${cur.classNo} ${cur.subject} (${cur.period}교시) 작성 중`);
    setTimeout(() => {
      setSlots(sl => sl.map(s => s.id === cur.id ? { ...s, synced: true } : s));
      appendLog("OK", `✓ ${cur.grade}-${cur.classNo} ${cur.subject} 반영됨`);
      i += 1;
      setProgress(p => ({ ...p, done: i }));
      setTimeout(tick, 260);
    }, 520);
  };
  setTimeout(tick, 300);
};
```

- [ ] **Step 3: pywebview 환경에서 시작 시 실제 오늘 슬롯 로드**

`App()` 함수 안, `useState` 선언 다음에 추가:

```javascript
/* pywebview 환경에서 오늘 슬롯 로드 */
useEffect(() => {
  if (!(window.__isPywebview && window.__isPywebview())) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  window.pywebview.api.get_today_slots(todayStr).then(raw => {
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) setSlots(data);
    } catch {}
  });
  window.pywebview.api.get_password().then(pw => {
    if (pw) setPassword(pw);
  });
}, []);
```

- [ ] **Step 4: 브라우저에서 index.html 열어 mock UI 정상 동작 확인**

파일 탐색기에서 `neis_attendance/index.html` 더블클릭 → React UI가 뜨고 실행 버튼 mock 동작 확인

- [ ] **Step 5: 커밋**

```bash
git add neis_attendance/app.jsx
git commit -m "feat: wire pywebview bridge in app.jsx for real API calls"
```

---

### Task 7: 통합 테스트 — pywebview 창에서 전체 흐름 확인

- [ ] **Step 1: 앱 실행**

```bash
cd /c/Users/admin/Desktop/2026_project/neis-attendance
python -m subject_teacher.main
```

- [ ] **Step 2: 체크리스트**

- [ ] 창이 1440×900으로 열린다
- [ ] 사이드바, 실행 뷰, 로그 독이 디자인대로 보인다
- [ ] "기본 정보" 사이드바 클릭 시 화면 전환된다
- [ ] 로그 독 클릭 시 접기/펼치기 된다
- [ ] (Drive 연결 없이) mock 데이터가 수업 목록에 표시된다
- [ ] "NEIS 반영 실행" 버튼 → 로그에 Python에서 스트리밍되는 메시지가 표시된다

- [ ] **Step 3: 커밋**

```bash
git commit -m "feat: pywebview GUI integration complete — React UI replaces CustomTkinter"
```

---

### Task 8: PyInstaller spec 업데이트

**Files:**
- Confirm path: 프로젝트 루트의 기존 `.spec` 파일 (NEIS_Teacher_20251230.spec 참고)

- [ ] **Step 1: spec 파일에 neis_attendance 폴더 datas 추가**

spec 파일의 `datas=[]` 부분을 찾아 다음으로 교체:

```python
datas=[
    ("subject_teacher/neis_attendance", "subject_teacher/neis_attendance"),
],
```

- [ ] **Step 2: 빌드 테스트**

```bash
pyinstaller --noconfirm subject_teacher.spec
```

Expected: `dist/` 폴더에 실행 파일 생성

- [ ] **Step 3: 커밋**

```bash
git add *.spec
git commit -m "build: include neis_attendance HTML assets in PyInstaller bundle"
```

---

## 체크: Spec Coverage

| 요구사항 | Task |
|---|---|
| pywebview 창 열기 | Task 2–3 |
| Python API 노출 | Task 3 |
| main.py 진입점 전환 | Task 4 |
| JS 브리지 (로그/진행상황) | Task 5–6 |
| 실행 버튼 → 실제 자동화 | Task 6 |
| 시작 시 실제 데이터 로드 | Task 6 |
| 배포용 빌드 | Task 8 |
