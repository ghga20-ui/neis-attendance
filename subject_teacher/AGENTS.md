# AGENTS.md

This file governs `subject_teacher/` and all child paths.
Use it together with the repository-level `AGENTS.md`; this file only adds tighter rules for the subject-teacher app.

## Scope

`subject_teacher` is the separate app for subject teachers.
It is not the homeroom-teacher GUI flow in `interface_teacher.py`.

## Product Intent And Current Handoff

This app is a four-part subject-teacher attendance product:

1. **Mobile UI/PWA**: the teacher checks attendance immediately after each lesson.
2. **Desktop GUI**: the teacher reviews Drive-backed lesson status and starts NEIS sync from the PC.
3. **NEIS automation setup/execution**: Selenium enters per-period subject attendance into NEIS, saves, optionally closes attendance, and handles per-slot failures.
4. **Google Drive data management/sync**: Google Drive `appDataFolder` is the only backend; mobile and desktop share `settings.json`, `timetable.json`, `students.json`, and `attendance-YYYY-MM.json`.

Current status as of 2026-04-27:

- Drive data management/sync is the most mature area. Schemas, OAuth, DPAPI token storage, Drive store, migrations, TSV helpers, sample seeding, and sync flags exist.
- Desktop GUI is mid-progress. The active work is in the feature worktree at `../.worktrees/feature/pywebview-gui`, where pywebview + React replaced the older CustomTkinter entry path and setup screens were connected to Drive data.
- NEIS automation has a working core for day/period processing, save/close, and sync-flag updates, but still needs real NEIS screen E2E verification and setup helpers such as importing timetable/rosters from NEIS.
- Mobile UI/PWA is essentially not implemented yet. The design calls for Vite + React + TypeScript PWA with Google Drive sync and offline queue, but no app scaffold is present.

Current continuation handoff as of 2026-05-04:

- The pywebview + React desktop GUI from the former worktree
  `../.worktrees/feature/pywebview-gui` has been mirrored back into the main
  project folder at `C:\Users\admin\Desktop\2026_project\neis-attendance`.
  Continue from the main project folder, not the worktree, unless the user
  explicitly asks otherwise.
- `subject_teacher/main.py` now launches the pywebview desktop app through
  `subject_teacher/gui/webview_app.py`; the old CustomTkinter subject-teacher
  shell files still exist but are not the current desktop entry path.
- The current desktop GUI surface lives in `subject_teacher/neis_attendance/`
  and talks to Python through `subject_teacher/gui/api.py` and
  `subject_teacher/neis_attendance/bridge.js`.
- Google Drive account confirmation, OAuth reauth handling, missing
  `client_secrets.json` diagnostics, and Drive-backed settings/timetable/
  students/attendance save-load flows were implemented and tested.
- PC-side attendance entry exists in the Run screen: selecting a lesson card
  shows the roster, student marks can be toggled, and `save_slot_attendance()`
  writes `attendance-YYYY-MM.json` records with `source="pc"`,
  `syncedToNeis=False`, and `closedOnNeis=False`.
- Student roster management is linked to timetable classes; manual arbitrary
  class creation was removed from the React setup flow. CSV/XLSX roster import
  was added through `Api.import_students_file()`.
- Playwright was installed and `playwright>=1.58` was added to
  `requirements.txt`.
- NEIS Selenium automation has been actively tuned against the real
  "과목별출결관리" page:
  - Date selection no longer uses `일자빼기/일자더하기`, because those buttons
    step through school days only. `select_date()` now targets the visible
    `aria-label="일자"` combobox/input, types/selects the target date, and
    dumps richer diagnostics to `tmp_neis_date_inputs.json` on failure.
  - Lesson selection now passes `slot.period`, `slot.neis_subject_label`,
    `slot.grade`, and `slot.class_no` into `select_period()`. The selector
    targets the left `출결일자목록` grid and matches `교시 + 학년 + 반 + 과목`
    so same-subject lessons such as `2학년 1(문학)` and `2학년 2(문학)` do not
    get confused.
  - `click_attendance_cell()` was reworked after real NEIS testing. The
    actual result mark is in the leftmost `출석상태` cell
    (`data-cellindex="7"`). A single click toggles `blank -> "/" -> blank`;
    therefore the helper first reads the cell/input/aria/title state and does
    not click if "/" is already present. It clicks using Chrome CDP mouse
    coordinates instead of Selenium `ActionChains`, because the NEIS/Cleopatra
    grid can route normal Selenium clicks to the wrong row.
  - `click_save()` now handles browser alerts, NEIS internal confirmation
    dialogs with `해당자료를 저장하시겠습니까?`, and save result notices such as
    `저장했습니다.` or `변경된 내용이 없습니다.`. Save completion waits were
    lengthened so the next lesson is not selected while a late save-complete
    modal is still open.
  - `process_day()` now verifies the visible NEIS footer result count before
    and after save. A slot is marked `syncedToNeis=true` only when the visible
    `결과: n명` count matches the number of Drive absences for that slot.
    Count mismatch fails the slot and leaves Drive sync flags unchanged.
  - GUI-triggered NEIS runs keep the Chrome window open for manual
    verification (`keep_browser_open=True` plus Chrome detach), while CLI runs
    still close the driver by default.
- Real NEIS manual verification on 2026-05-04:
  - Drive records were set to `2-1 문학 3교시: 3번, 12번 결과` and
    `2-2 문학 6교시: 1번 결과`.
  - NEIS was verified with the user: `2-1` showed 3번/12번 as `/` and
    `결과: 2명`; `2-2` showed 1번 as `/` and `결과: 1명`.
  - Both slots were saved in NEIS. Drive flags were updated to
    `syncedToNeis=true`, `closedOnNeis=false`.
- Verified after the latest NEIS hardening: `py -3 -m pytest -q` from
  `C:\Users\admin\Desktop\2026_project\neis-attendance` reported `88 passed`.
- The raw Codex session JSONL for this work is:
  `/home/sejun/.codex/sessions/2026/04/27/rollout-2026-04-27T10-59-21-019dcca9-9ed8-7323-9343-9f4436a3c331.jsonl`.
  It includes the long NEIS/Drive/GUI debugging thread through 2026-05-04.

Known near-term gaps:

- NEIS subject-attendance E2E has one live verified case on 2026-05-04, but
  the Cleopatra grid is brittle. If marking fails again, first inspect the
  actual visible grid state and the `data-cellindex="7"` status cell rather
  than adding broad XPath or coordinate fallbacks.
- `visible_result_count()` validates the footer `결과: n명`. If NEIS changes the
  footer wording or hides the footer behind scroll/resize state, update that
  parser before trusting Drive sync flags.
- The current workflow supports saved sync without automatic `출결마감` by
  default in the tested flow. Closing/마감 behavior still needs separate live
  verification before enabling broad automatic close runs.
- Debug dumps such as `tmp_neis_date_inputs.json`,
  `tmp_neis_period_candidates.json`, `tmp_student_candidates.json`, and
  `tmp_neis_save_dialogs.json` are local diagnostics only and must not be
  committed.

Before continuing implementation in a new session, read:

- `docs/superpowers/specs/2026-04-17-subject-teacher-design.md`
- `docs/superpowers/plans/2026-04-17-subject-teacher-plan1-foundation.md`
- `docs/superpowers/plans/2026-04-24-pywebview-gui.md`
- `docs/superpowers/plans/2026-04-27-subject-teacher-handoff.md`

Do not jump to PyInstaller packaging until the mobile/desktop/Drive/NEIS workflow is aligned and manually verified. A draft `NEIS_Subject_Teacher.spec` may exist in the pywebview feature worktree from an interrupted build attempt; treat it as exploratory until reviewed.

Primary responsibilities in this package:

- Google OAuth + Drive `appDataFolder` persistence
- DPAPI-backed local token/password storage
- Subject-attendance NEIS Selenium automation
- Subject-teacher GUI and helper scripts

Shared root modules still matter here:

- `regions.py`
- `utils.py`
- `logger_config.py`
- `config.py`

Prefer changing `subject_teacher/*` first.
Only edit shared root modules when the task truly affects both apps.

## Run And Debug

- Runtime assumption: this app is Windows-oriented and expects GUI/OAuth dependencies from `requirements.txt` to be installed.
- GUI launch: `python -m subject_teacher.main`
- OAuth bootstrap: `python -m subject_teacher.scripts.authorize`
- Seed sample Drive data: `python -m subject_teacher.scripts.seed_sample --date 2026-04-20 --region 경기`
- Manual one-day sync: `python -m subject_teacher.scripts.run_day_manually --date 2026-04-20 --neis-password <PW> --region 경기 --close`

## Code Map

- `main.py`: GUI entry point
- `gui/app.py`: top-level CustomTkinter shell
- `gui/setup_tab.py`: settings, timetable, and student roster editing
- `gui/run_tab.py`: OAuth refresh, summary view, and threaded NEIS execution
- `app_service.py`: run orchestration, Selenium driver creation, Drive-to-NEIS preparation, sync-flag updates
- `state.py`: store factory, local password helpers, TSV serialization/parsing, daily summary helpers
- `auth/`: Google OAuth and DPAPI token storage
- `drive/`: appDataFolder client, schemas, migrations, persistence
- `neis/runner.py`: per-day orchestration with per-slot failure isolation
- `neis/subject_commands.py`: low-level selectors and button/cell interactions
- `scripts/`: manual bootstrap and operator utilities

## Data And Security Rules

- Drive JSON contracts use camelCase aliases via Pydantic models in `drive/schemas.py`; keep stored field compatibility unless a migration is added.
- If schema shape changes, update `drive/migrations.py` and the corresponding tests in `tests/test_drive_*`.
- Never store the NEIS certificate password or Google tokens in Drive JSON.
- Local secrets belong under `%LOCALAPPDATA%/NeisSubject` through `paths.py` and `auth/token_store.py`.
- In tests or non-Windows shells, set `LOCALAPPDATA` to a writable temp path before calling path/token helpers directly.
- Do not commit `client_secrets.json`, `token.bin`, `password.bin`, or ad-hoc debug dumps such as `tmp_student_candidates.json`.

## Change Guidance

- Keep the subject-teacher app separate from the homeroom app; avoid coupling new logic back into `interface_teacher.py` unless explicitly requested.
- Preserve background execution for long-running Drive/NEIS work so the GUI does not block.
- Prefer small helper additions over large abstraction layers; this package is still compact and task-oriented.
- When touching Selenium selectors or click flows, keep fallbacks and failure diagnostics intact because NEIS markup is brittle.
- When touching `build_day_input`, sync flags, or summary logic, verify both unchecked-slot behavior and re-run/idempotency behavior.

## Verification

Run the smallest relevant test set first, then widen only if your change crosses boundaries.

- State/service flow: `pytest tests/test_subject_teacher_state.py tests/test_app_service.py tests/test_neis_runner.py`
- Selectors: `pytest tests/test_subject_commands_selectors.py`
- Drive/auth/path contracts: `pytest tests/test_drive_client.py tests/test_drive_store.py tests/test_drive_schemas.py tests/test_drive_migrations.py tests/test_google_oauth.py tests/test_token_store.py tests/test_password_crypto.py tests/test_paths.py`

If you change GUI behavior, add at least targeted logic coverage where possible and note any manual-only verification gaps in the final report.
