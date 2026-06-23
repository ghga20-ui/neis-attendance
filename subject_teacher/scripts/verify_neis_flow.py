"""On-demand smoke harness for the LIVE NEIS subject-attendance automation.

Read-only by default. Destructive actions are gated behind explicit flags:

  --verify-save        : click 저장 on an UNCHANGED grid; expects "no_change"
                         (nothing written). Safe.
  --mark "2-1:3;2-2:2" : absences to enter (grade-class:numbers). Requires
                         --do-write to actually run; only the listed classes
                         are touched.
  --do-write           : DANGER — actually mark the --mark absences AND click
                         저장 (writes real attendance data).
  --close              : DANGER — actually click 출결마감, which LOCKS the class.

Run from the REPO ROOT:

    $env:NEIS_TEST_PW="..."   # PowerShell
    python -m subject_teacher.scripts.verify_neis_flow \
        --date 2026-06-22 --auto-slot --all-slots --mark "2-1:3;2-2:2" --do-write --close

--auto-slot pulls real slots from the Drive timetable for the date's weekday.
--all-slots iterates every slot (also exercises class switching / 반 이동).
Each stage prints PASS/FAIL + elapsed; a final summary lists results.

Needs the NEIS certificate in the Chrome_NEIS_Profile that create_driver uses.
"""
from __future__ import annotations

import argparse
import os
import time
from datetime import date as date_type

import config

from subject_teacher.app_service import create_driver
from subject_teacher.neis import subject_commands as sc
import utils


_DUMP_JS = r"""
const wanted = arguments[0];
const isVisible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const s = window.getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
};
const rows = Array.from(document.querySelectorAll("[role='row'], .cl-grid-row")).filter(isVisible);
const out = [];
for (const row of rows) {
  const numCell = row.querySelector("[data-cellindex='4']");
  if (!numCell) continue;
  const num = (numCell.innerText || numCell.textContent || '').replace(/\s+/g,' ').trim();
  if (wanted && !wanted.map(String).includes(num)) continue;
  const cells = Array.from(row.querySelectorAll('[data-cellindex]')).map((c) => ({
    idx: c.getAttribute('data-cellindex'),
    role: c.getAttribute('role') || '',
    aria: c.getAttribute('aria-label') || '',
    cls: String(c.className || '').slice(0, 80),
    text: (c.innerText || c.textContent || '').replace(/\s+/g,' ').trim().slice(0, 40),
    inputs: Array.from(c.querySelectorAll('input,textarea,select')).map((i) => ({
      tag: i.tagName, type: i.getAttribute('type') || '', value: i.value || '',
      aria: i.getAttribute('aria-label') || '', cls: String(i.className || '').slice(0, 60),
    })),
    html: (c.outerHTML || '').slice(0, 300),
  }));
  out.push({ number: num, cellCount: cells.length, cells });
  if (out.length >= 3) break;
}
return out;
"""


_PROBE_JS = r"""
const isVisible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const s = window.getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
};
const result = { popups: [], statusCells: [] };
const sel = "[role='listbox'],[role='option'],[role='menu'],[role='menuitem'],"
  + ".cl-combobox,.cl-combobox-list,.cl-combobox-item,.cl-popup,.cl-listbox,.cl-list,"
  + ".cl-dropdownlist,.cl-dropdown,[class*='popup'],[class*='dropdown'],[class*='listbox']";
for (const el of Array.from(document.querySelectorAll(sel)).filter(isVisible)) {
  result.popups.push({
    role: el.getAttribute('role') || '',
    cls: String(el.className || '').slice(0, 90),
    aria: el.getAttribute('aria-label') || '',
    text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
    html: (el.outerHTML || '').slice(0, 300),
  });
  if (result.popups.length >= 30) break;
}
for (const c of Array.from(document.querySelectorAll("[data-cellindex='7']")).filter(isVisible)) {
  result.statusCells.push({
    aria: c.getAttribute('aria-label') || '',
    text: (c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    inputs: Array.from(c.querySelectorAll('input,textarea,select')).map((i) => ({
      tag: i.tagName, value: i.value || '', cls: String(i.className || '').slice(0, 60),
    })),
    html: (c.outerHTML || '').slice(0, 500),
  });
  if (result.statusCells.length >= 4) break;
}
return result;
"""


_TITLE_JS = r"""
const num = String(arguments[0]);
const isVisible = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const s = window.getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
};
const rows = Array.from(document.querySelectorAll("[role='row'], .cl-grid-row")).filter(isVisible);
for (const row of rows) {
  const numCell = row.querySelector("[data-cellindex='4']");
  if (!numCell) continue;
  const n = (numCell.innerText || numCell.textContent || '').replace(/\s+/g,' ').trim();
  if (n !== num) continue;
  const cells = [];
  for (const idx of ['7', '8', '9']) {
    const c = row.querySelector(`[data-cellindex='${idx}']`);
    if (!c) continue;
    const titles = [c.getAttribute('title') || ''];
    let value = '';
    c.querySelectorAll('*').forEach((d) => { const t = d.getAttribute('title'); if (t) titles.push(t); });
    const inp = c.querySelector('input,textarea');
    if (inp) value = inp.value || '';
    cells.push({ idx, aria: c.getAttribute('aria-label') || '',
                 titles: titles.filter(Boolean).map((t) => t.replace(/\s+/g,' ').trim()),
                 value });
  }
  return cells;
}
return null;
"""


def _stage(results, name, fn):
    """Run one stage, record (name, ok, elapsed, detail), print a line."""
    start = time.time()
    try:
        detail = fn()
        elapsed = time.time() - start
        results.append((name, True, elapsed, detail))
        print(f"  [PASS] {name}  ({elapsed:.2f}s){'  ' + str(detail) if detail is not None else ''}")
        return True
    except Exception as exc:  # noqa: BLE001 - smoke harness wants the message
        elapsed = time.time() - start
        results.append((name, False, elapsed, repr(exc)))
        print(f"  [FAIL] {name}  ({elapsed:.2f}s)  {exc!r}")
        return False


def _resolve_slots(args):
    """Return a list of (period, grade, class_no, subject) tuples to test."""
    if args.auto_slot:
        from subject_teacher.state import build_store

        weekday = date_type.fromisoformat(args.date).isoweekday()
        timetable = build_store().load_timetable()
        if timetable is None:
            raise SystemExit("ERROR: --auto-slot needs timetable.json in Drive")
        day_slots = [s for s in timetable.slots if s.day_of_week == weekday]
        if args.period is not None:
            day_slots = [s for s in day_slots if s.period == args.period]
        if not day_slots:
            raise SystemExit(f"ERROR: no timetable slot for {args.date} (weekday {weekday})")
        day_slots.sort(key=lambda s: s.period)
        chosen = day_slots if args.all_slots else day_slots[:1]
        return [(s.period, s.grade, s.class_no, s.neis_subject_label or s.subject_name) for s in chosen]

    if args.period is None:
        raise SystemExit("ERROR: provide --period (or use --auto-slot)")
    return [(args.period, args.grade, args.class_no, args.subject)]


def _parse_mark(spec):
    """'2-1:3,5;2-2:2' -> {'2-1': [3, 5], '2-2': [2]}."""
    mark = {}
    for part in (spec or "").split(";"):
        part = part.strip()
        if not part:
            continue
        key, nums = part.split(":")
        mark[key.strip()] = [int(n) for n in nums.split(",") if n.strip()]
    return mark


def main() -> int:
    parser = argparse.ArgumentParser(description="Live NEIS automation smoke test")
    parser.add_argument("--region", default="경기")
    parser.add_argument("--date", required=True, help="YYYY-MM-DD")
    parser.add_argument("--period", type=int, default=None)
    parser.add_argument("--subject", default=None)
    parser.add_argument("--grade", type=int, default=None)
    parser.add_argument("--class", dest="class_no", default=None)
    parser.add_argument("--auto-slot", action="store_true")
    parser.add_argument("--all-slots", action="store_true")
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--term", type=int, default=1)
    parser.add_argument("--password", default=os.environ.get("NEIS_TEST_PW"))
    parser.add_argument("--verify-save", action="store_true")
    parser.add_argument("--check", action="store_true",
                        help="READ-ONLY: report whether --mark students are currently marked absent")
    parser.add_argument("--dump-grid", action="store_true",
                        help="READ-ONLY: dump the target students' row DOM to tmp_grid_dump_<class>.json")
    parser.add_argument("--probe-status", action="store_true",
                        help="READ-ONLY: click the status cell, capture the editor/popup, then ESC (no save)")
    parser.add_argument("--mark", default=None, help="absences e.g. '2-1:3;2-2:2'; needs --do-write")
    parser.add_argument("--do-write", action="store_true",
                        help="DANGER: actually mark --mark absences and click 저장 (writes real data)")
    parser.add_argument("--close", action="store_true",
                        help="DANGER: actually click 출결마감 (LOCKS the class)")
    parser.add_argument("--runner", action="store_true",
                        help="use the real process_day() production flow for --mark slots (search/reset/verify/save[/close])")
    parser.add_argument("--diagnose-write", action="store_true",
                        help="single-session trace of mark->commit->save->reload reading cell titles (writes+saves)")
    parser.add_argument("--keep-open", action="store_true")
    args = parser.parse_args()

    if not args.password:
        print("ERROR: provide --password or set NEIS_TEST_PW")
        return 2

    year = args.year or date_type.fromisoformat(args.date).year
    config.selected_region = args.region
    slots = _resolve_slots(args)
    mark_map = _parse_mark(args.mark)
    if mark_map:
        slots = [s for s in slots if f"{s[1]}-{s[2]}" in mark_map]
        if not slots:
            print(f"ERROR: --mark classes {list(mark_map)} not among the date's slots")
            return 2

    print(f"NEIS smoke — region={args.region} date={args.date} term={args.term} "
          f"| {len(slots)} slot(s)  write={args.do_write} close={args.close}")
    for period, grade, class_no, subject in slots:
        key = f"{grade}-{class_no}"
        print(f"   slot p{period} {key} subject={subject!r} absences={mark_map.get(key, [])}")

    results: list[tuple] = []
    driver = create_driver(keep_browser_open=True)
    try:
        if not _stage(results, "login", lambda: utils.open_neis_direct(driver, args.password)):
            return _summary(results)

        if args.diagnose_write:
            from selenium.webdriver.common.action_chains import ActionChains
            from selenium.webdriver.common.keys import Keys

            period, grade, class_no, subject = slots[0]
            num = mark_map[f"{grade}-{class_no}"][0]

            def titles(label):
                t = driver.execute_script(_TITLE_JS, num)
                print(f"   [{label}] #{num} status cells: {t}")
                return t

            sc.open_subject_attendance_page(driver, year, args.term)
            sc.select_day_mode(driver)
            sc.select_date(driver, args.date)
            sc.click_search(driver)
            sc.select_period(driver, period, subject, grade, class_no)
            sc.click_reset(driver)
            titles("before-mark")

            cell = sc._student_status_cell(driver, num)
            sc._click_grid_cell(driver, cell)
            time.sleep(0.3)
            titles("after-click")

            # commit attempt 1: Enter on the active editor
            try:
                ActionChains(driver).send_keys(Keys.ENTER).perform()
            except Exception as exc:
                print("   enter failed:", exc)
            time.sleep(0.3)
            titles("after-enter")

            try:
                cnt = sc.visible_result_count(driver)
                print("   visible_result_count:", cnt)
            except Exception as exc:
                print("   visible_result_count error:", exc)

            saved = sc.click_save(driver)
            print("   click_save ->", saved)
            time.sleep(0.5)
            titles("after-save")

            # force a server reload and re-read
            sc.click_search(driver)
            sc.select_period(driver, period, subject, grade, class_no)
            titles("after-reload")

            return _summary(results)

        if args.runner:
            from subject_teacher.drive.schemas import Absence, MarkType, SlotAttendance, TimetableSlot
            from subject_teacher.neis.runner import DayInput, process_day

            weekday = date_type.fromisoformat(args.date).isoweekday()
            day_slots = []
            for period, grade, class_no, subject in slots:
                nums = mark_map.get(f"{grade}-{class_no}", [])
                ts = TimetableSlot(
                    id=f"{grade}-{class_no}-p{period}", dayOfWeek=weekday, period=period,
                    grade=grade, classNo=str(class_no),
                    subjectName=subject or "x", neisSubjectLabel=subject or "x",
                )
                sa = SlotAttendance(
                    absences=[Absence(studentNumber=n, markType=MarkType.ABSENT) for n in nums],
                    checkedAt=f"{args.date}T09:00:00+09:00", source="pc",
                )
                day_slots.append((ts, sa))
            day = DayInput(date=args.date, year=year, term=args.term, slots=day_slots)
            print(f"  -> process_day close_after={args.close} ...")
            res = process_day(driver, day, close_after=args.close)
            for r in res:
                ok = r.status == "ok"
                results.append((f"runner[{r.slot_id}]", ok, 0.0, f"{r.status} {r.error}".strip()))
                print(f"  [{'PASS' if ok else 'FAIL'}] runner[{r.slot_id}]  {r.status}  {r.error}")
            return _summary(results)

        if not _stage(results, "open_attendance_page",
                      lambda: sc.open_subject_attendance_page(driver, year, args.term)):
            return _summary(results)
        _stage(results, "select_day_mode", lambda: sc.select_day_mode(driver))
        if not _stage(results, "select_date", lambda: sc.select_date(driver, args.date)):
            return _summary(results)
        # Mirror the production flow: 조회(search) refreshes the grid for the date.
        # Without it, grid reads see a stale/empty grid (false negatives).
        _stage(results, "search", lambda: sc.click_search(driver))

        for period, grade, class_no, subject in slots:
            tag = f"{grade}-{class_no} p{period}"
            key = f"{grade}-{class_no}"
            if not _stage(results, f"select_period[{tag}]",
                          lambda p=period, s=subject, g=grade, c=class_no: sc.select_period(driver, p, s, g, c)):
                continue
            _stage(results, f"grid_loaded[{tag}]", lambda: sc.visible_result_count(driver))

            numbers = mark_map.get(key, [])
            if args.dump_grid:
                import json as _json

                def _dump(nums=numbers, k=key):
                    data = driver.execute_script(_DUMP_JS, [int(n) for n in nums] or None)
                    path = f"tmp_grid_dump_{k}.json"
                    with open(path, "w", encoding="utf-8") as fh:
                        _json.dump(data, fh, ensure_ascii=False, indent=2)
                    return f"{len(data)} row(s) -> {path}"

                _stage(results, f"dump_grid[{tag}]", _dump)
            if args.probe_status and numbers:
                import json as _json
                from selenium.webdriver.common.keys import Keys as _Keys

                def _probe(nums=numbers, k=key):
                    cell = sc._student_status_cell(driver, int(nums[0]))
                    if cell is None:
                        return "status cell not found"
                    sc._click_grid_cell(driver, cell)
                    time.sleep(0.7)
                    data = driver.execute_script(_PROBE_JS)
                    path = f"tmp_status_popup_{k}.json"
                    with open(path, "w", encoding="utf-8") as fh:
                        _json.dump(data, fh, ensure_ascii=False, indent=2)
                    try:  # close editor without selecting anything (no write)
                        driver.switch_to.active_element.send_keys(_Keys.ESCAPE)
                    except Exception:
                        pass
                    return f"popups={len(data.get('popups', []))} -> {path}"

                _stage(results, f"probe_status[{tag}]", _probe)
            if args.check and numbers:
                # READ-ONLY: report current absent state for each student.
                for num in numbers:
                    _stage(results, f"check_absent[{tag}#{num}]",
                           lambda n=num: sc._student_row_has_absent_mark(driver, n))
            elif numbers and args.do_write:
                marks = [
                    _stage(results, f"mark_absent[{tag}#{num}]",
                           lambda n=num: sc.click_attendance_cell(driver, n, expected_mark="absent"))
                    for num in numbers
                ]
                if not all(marks):
                    # Do NOT save/close a slot whose marking failed — that would lock
                    # an unintended state.
                    print(f"  -> mark failed for {tag}; skipping save/close")
                    continue
                _stage(results, f"save[{tag}]", lambda: sc.click_save(driver))
                if args.close:
                    _stage(results, f"CLOSE[{tag}]", lambda: sc.click_close(driver))
            elif args.verify_save:
                _stage(results, f"save_no_change[{tag}]", lambda: sc.click_save(driver))
                if args.close:
                    _stage(results, f"CLOSE[{tag}]", lambda: sc.click_close(driver))

        return _summary(results)
    finally:
        if not args.keep_open:
            try:
                driver.quit()
            except Exception:
                pass


def _summary(results) -> int:
    print("\n=== SUMMARY ===")
    ok = sum(1 for _n, passed, _e, _d in results if passed)
    for name, passed, elapsed, detail in results:
        flag = "PASS" if passed else "FAIL"
        print(f"  {flag:4}  {name:30} {elapsed:6.2f}s  {detail if detail is not None else ''}")
    print(f"{ok}/{len(results)} stages passed")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
