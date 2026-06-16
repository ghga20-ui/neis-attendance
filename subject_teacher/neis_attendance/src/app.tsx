// @ts-nocheck -- verbatim JS->TSX port; incremental typing is a follow-up
import React from "react";
import { Icon } from "./components";
import { LogDock } from "./log-panel";
import { RunView } from "./run-view";
import { BasicsView, TimetableView, RosterView, DriveView, AuthView, PlaceholderView } from "./setup-view";
import { TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakToggle, TweakSlider, TweakColor, TweakSelect } from "./tweaks-panel";
import { TODAY_SLOTS, TIMETABLE, ROSTERS } from "./data";
import {
  now, todayIso, toIsoDate, weekKeyFromIsoDate, toGradeNumber, normalizeSubjectName,
  DAY_TO_KEY, KEY_TO_DAY, parseJsonResult, formatApiError, isTransientNetworkError, parseTextResult,
  settingsFromApi, settingsToApi, timetableRowsFromTsv, timetableRowsToTsv, rostersFromTsv, rostersToTsv,
  classKeyFromTimetableRow, rosterKeysFromTimetable, syncRostersToTimetable,
} from "./lib/transforms";

const { useState, useEffect, useMemo, useRef } = React;

const NAV = [
  { group: "작업",  items: [
    { key: "run",      label: "실행",         icon: "bolt",    badge: "대기 3" },
  ]},
  { group: "설정",  items: [
    { key: "basics",   label: "기본 정보",    icon: "gear" },
    { key: "timetable",label: "시간표",       icon: "board" },
    { key: "roster",   label: "학생 명부",    icon: "users" },
  ]},
  { group: "연결",  items: [
    { key: "drive",    label: "Google Drive", icon: "cloud" },
    { key: "auth",     label: "OAuth 인증",   icon: "key" },
  ]},
  { group: "기타",  items: [
    { key: "log",      label: "실행 기록",    icon: "list" },
    { key: "schedule", label: "예약 실행",    icon: "calendar" },
  ]},
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#0A84FF",
  "theme": "light",
  "density": "cozy",
  "sidebarMode": "expanded",
  "showLog": true,
  "corner": 18
}/*EDITMODE-END*/;


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function App() {
  const [tweaks, setTweaks] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = useState<any>("run");
  const [slots, setSlots] = useState<any>(TODAY_SLOTS);
  const [timetable, setTimetable] = useState<any>(TIMETABLE);
  const [rosters, setRosters] = useState<any>(ROSTERS);
  const [date, setDate] = useState<any>(todayIso());
  const [password, setPassword] = useState<any>("");
  const [closeAfter, setCloseAfter] = useState<any>(true);
  const [running, setRunning] = useState<any>(false);
  const [progress, setProgress] = useState<any>({ done: 0, total: 0, current: "", state: "idle" });
  const [logCollapsed, setLogCollapsed] = useState<any>(true);
  const [logLines, setLogLines] = useState<any>([
    { ts: "09:02:14", lv: "INFO", msg: "앱 실행 — subject_teacher v0.4.1" },
    { ts: "09:02:14", lv: "OK",   msg: "Drive appDataFolder 연결 · 3개 파일 감지" },
    { ts: "09:02:15", lv: "INFO", msg: "settings.json, timetable.json, students.json 동기화 완료" },
    { ts: "09:02:15", lv: "OK",   msg: "오늘 수업 6건 로드 — 3건 반영됨, 3건 대기" },
  ]);
  const [settings, setSettings] = useState<any>({
    teacherName: "", schoolName: "", region: "서울", year: "2026", term: "1", effectiveFrom: "2026-03-02", closeByDefault: true,
    timetableMode: "neis", assignedLessons: []
  });
  const [neisApiKey, setNeisApiKey] = useState<any>("");
  const [driveUser, setDriveUser] = useState<any>(null);
  const [slotLoading, setSlotLoading] = useState<any>(false);
  const [slotError, setSlotError] = useState<any>("");
  const mobileTimetableSyncRef = useRef(new Set());
  const rosterKeySignature = useMemo(
    () => rosterKeysFromTimetable(timetable, settings.assignedLessons).join("\t"),
    [timetable, JSON.stringify(settings.assignedLessons || [])],
  );

  const appendLog = (lv, msg) => {
    setLogCollapsed(false);
    setLogLines(l => [...l, { ts: now(), lv, msg }]);
  };
  const clearLog = () => setLogLines([]);

  const refreshSlots = (dateStr = toIsoDate(date), options = {}) => {
    if (!(window.__isPywebview && window.__isPywebview())) return Promise.resolve();
    const attempts = options.attempts || 3;
    setSlotLoading(true);
    setSlotError("");
    const run = (attempt) => window.pywebview!.api.get_today_slots(dateStr)
      .then(raw => {
        const data = parseJsonResult(raw);
        if (Array.isArray(data)) setSlots(data);
        return data;
      })
      .catch(err => {
        if (attempt < attempts && isTransientNetworkError(err)) {
          if (attempt === 1 && !options.silentRetry) {
            appendLog("INFO", "네트워크가 불안정해 수업을 다시 불러오는 중...");
          }
          return sleep(600 * attempt).then(() => run(attempt + 1));
        }
        const message = formatApiError(err);
        setSlotError(message);
        appendLog("ERR", `수업 불러오기 실패: ${message}`);
      });
    return run(1).finally(() => setSlotLoading(false));
  };

  const loadSetupData = () => {
    if (!(window.__isPywebview && window.__isPywebview())) {
      appendLog("INFO", "브라우저 미리보기에서는 샘플 설정을 사용합니다");
      return Promise.resolve();
    }
    appendLog("INFO", "Drive 설정을 불러오는 중...");
    return window.pywebview!.api.get_drive_user()
      .then(userRaw => window.pywebview!.api.get_settings().then(settingsRaw => ({ userRaw, settingsRaw })))
      .then(({ userRaw, settingsRaw }) => (
        window.pywebview!.api.get_timetable_tsv()
          .then(timetableRaw => ({ userRaw, settingsRaw, timetableRaw }))
      ))
      .then(({ userRaw, settingsRaw, timetableRaw }) => (
        window.pywebview!.api.get_students_tsv()
          .then(studentsRaw => ({ userRaw, settingsRaw, timetableRaw, studentsRaw }))
      ))
      .then(({ userRaw, settingsRaw, timetableRaw, studentsRaw }) => {
      const loadedUser = parseJsonResult(userRaw);
      const loadedSettings = settingsFromApi(parseJsonResult(settingsRaw));
      const loadedTimetable = timetableRowsFromTsv(parseTextResult(timetableRaw));
      const loadedRosters = rostersFromTsv(parseTextResult(studentsRaw));
      setDriveUser(loadedUser);
      setSettings(loadedSettings);
      setCloseAfter(loadedSettings.closeByDefault);
      setTimetable(loadedTimetable);
      setRosters(syncRostersToTimetable(loadedRosters, loadedTimetable, loadedSettings.assignedLessons));
      appendLog("OK", `Drive 설정 불러오기 완료 · ${loadedUser.emailAddress || "계정 미확인"} · 수업 ${loadedTimetable.length}개`);
      return refreshSlots(toIsoDate(date));
    }).catch(err => appendLog("ERR", `Drive 설정 불러오기 실패: ${formatApiError(err)}`));
  };

  useEffect(() => {
    setRosters(prev => syncRostersToTimetable(prev, timetable, settings.assignedLessons));
  }, [rosterKeySignature]);

  const saveSettings = (successMessage = "settings.json 저장 완료") => {
    if (!(window.__isPywebview && window.__isPywebview())) {
      appendLog("OK", `${successMessage} (미리보기)`);
      return Promise.resolve();
    }
    return window.pywebview!.api.save_settings(JSON.stringify(settingsToApi(settings)))
      .then(raw => {
        parseJsonResult(raw);
        appendLog("OK", successMessage);
        return refreshSlots(toIsoDate(date));
      })
      .catch(err => appendLog("ERR", `settings.json 저장 실패: ${formatApiError(err)}`));
  };

  const saveTimetable = () => {
    if (!(window.__isPywebview && window.__isPywebview())) {
      appendLog("OK", "timetable.json 저장 완료 (미리보기)");
      return;
    }
    window.pywebview!.api.save_timetable_tsv(timetableRowsToTsv(timetable), settings.effectiveFrom)
      .then(raw => {
        parseJsonResult(raw);
        appendLog("OK", "timetable.json 저장 완료");
        return refreshSlots(toIsoDate(date));
      })
      .catch(err => appendLog("ERR", `timetable.json 저장 실패: ${formatApiError(err)}`));
  };

  const previewNeisPublicTimetable = (payload) => {
    const request = {
      ...payload,
      region: payload.region || settings.region,
      schoolName: payload.schoolName || settings.schoolName,
      apiKey: payload.apiKey || neisApiKey,
    };
    if (!(window.__isPywebview && window.__isPywebview())) {
      const targetDay = ["일","월","화","수","목","금","토"][new Date(`${request.date}T00:00:00`).getDay()];
      const lessons = timetable
        .filter(row => row.day === targetDay && Number(row.grade) === Number(request.grade) && String(row.classNo) === String(request.classNo))
        .map(row => ({ day: row.day, period: row.period, grade: row.grade, classNo: row.classNo, subject: row.subject, neis: row.neis || row.subject }));
      appendLog("INFO", "브라우저 미리보기에서는 현재 시간표에서 후보를 만듭니다");
      return Promise.resolve({ school: { name: request.schoolName || "미리보기 학교" }, date: request.date, lessons });
    }
    return window.pywebview!.api.preview_neis_public_timetable(JSON.stringify(request))
      .then(raw => parseJsonResult(raw));
  };

  const findNeisSubjectCandidates = (payload) => {
    const request = {
      ...payload,
      region: payload.region || settings.region,
      schoolName: payload.schoolName || settings.schoolName,
      apiKey: payload.apiKey || neisApiKey,
    };
    if (!(window.__isPywebview && window.__isPywebview())) {
      const input = normalizeSubjectName(request.subjectName || "");
      const subjects = [...new Set(timetable.map(row => row.neis || row.subject).filter(Boolean))];
      const candidates = subjects
        .map(subject => ({ subject, score: normalizeSubjectName(subject) === input ? 100 : 50 }))
        .filter(candidate => input && normalizeSubjectName(candidate.subject).includes(input))
        .slice(0, 8);
      appendLog("INFO", "브라우저 미리보기에서는 현재 시간표 과목에서 후보를 만듭니다");
      return Promise.resolve({ scope: "preview", candidates });
    }
    return window.pywebview!.api.find_neis_subject_candidates(JSON.stringify(request))
      .then(raw => parseJsonResult(raw));
  };

  const saveNeisApiKey = () => {
    if (!(window.__isPywebview && window.__isPywebview())) {
      appendLog("OK", "NEIS Open API 키 저장 완료 (미리보기)");
      return Promise.resolve();
    }
    return window.pywebview!.api.save_neis_api_key(neisApiKey)
      .then(() => appendLog("OK", "NEIS Open API 키 로컬 저장 완료"))
      .catch(err => appendLog("ERR", `NEIS Open API 키 저장 실패: ${formatApiError(err)}`));
  };

  const publishNeisTimetableForMobile = (dateStr = toIsoDate(date), options = {}) => {
    const targetDate = toIsoDate(dateStr);
    const weekKey = weekKeyFromIsoDate(targetDate);
    if (!options.force && options.once && mobileTimetableSyncRef.current.has(weekKey)) {
      return Promise.resolve({ ok: true, skipped: true, effectiveFrom: weekKey });
    }
    if (!options.force && options.once) mobileTimetableSyncRef.current.add(weekKey);
    if (!(window.__isPywebview && window.__isPywebview())) {
      mobileTimetableSyncRef.current.add(weekKey);
      if (!options.silent) appendLog("OK", "모바일용 시간표 갱신 완료 (미리보기)");
      return Promise.resolve({ ok: true, effectiveFrom: weekKey });
    }
    return window.pywebview!.api.publish_neis_timetable_for_week(targetDate)
      .then(raw => {
        const data = parseJsonResult(raw);
        mobileTimetableSyncRef.current.add(data.effectiveFrom || weekKey);
        if (!options.silent) appendLog("OK", `모바일용 timetable.json 갱신 완료 · ${data.count || 0}건`);
        return data;
      })
      .catch(err => {
        mobileTimetableSyncRef.current.delete(weekKey);
        appendLog("ERR", `모바일용 timetable.json 갱신 실패: ${formatApiError(err)}`);
      });
  };

  useEffect(() => {
    if (page !== "run") return;
    if ((settings.timetableMode || "neis") !== "neis") return;
    if (!(settings.assignedLessons || []).length) return;
    if (typeof window.__onPywebviewReady !== "function") return;
    let cancelled = false;
    const targetDate = toIsoDate(date);
    window.__onPywebviewReady(() => {
      if (!cancelled) publishNeisTimetableForMobile(targetDate, { once: true, silent: true });
    });
    return () => { cancelled = true; };
  }, [page, date, settings.timetableMode, settings.region, settings.schoolName, JSON.stringify(settings.assignedLessons || [])]);

  const saveRosters = () => {
    if (!(window.__isPywebview && window.__isPywebview())) {
      appendLog("OK", "students.json 저장 완료 (미리보기)");
      return;
    }
    window.pywebview!.api.save_students_tsv(rostersToTsv(syncRostersToTimetable(rosters, timetable, settings.assignedLessons)))
      .then(raw => {
        parseJsonResult(raw);
        appendLog("OK", "students.json 저장 완료");
      })
      .catch(err => appendLog("ERR", `students.json 저장 실패: ${formatApiError(err)}`));
  };

  const importRosterFile = (klass) => {
    if (!klass) {
      appendLog("ERR", "먼저 학급을 추가하거나 선택해 주세요");
      return Promise.resolve();
    }
    if (!(window.__isPywebview && window.__isPywebview())) {
      appendLog("INFO", "브라우저 미리보기에서는 파일 가져오기를 사용할 수 없습니다");
      return Promise.resolve();
    }
    return window.pywebview!.api.import_students_file(klass)
      .then(raw => {
        const data = parseJsonResult(raw);
        if (data.cancelled) return;
        setRosters(prev => ({ ...prev, [data.classKey]: data.students || [] }));
        appendLog("OK", `${data.classKey} 명부 파일 가져오기 완료 · ${(data.students || []).length}명`);
      })
      .catch(err => appendLog("ERR", `명부 파일 가져오기 실패: ${formatApiError(err)}`));
  };

  const saveSlotAttendance = (slotId, marks) => {
    if (!(window.__isPywebview && window.__isPywebview())) {
      appendLog("OK", "attendance 저장 완료 (미리보기)");
      return Promise.resolve({ ok: true, checkedAt: new Date().toISOString() });
    }
    return window.pywebview!.api.save_slot_attendance(toIsoDate(date), slotId, JSON.stringify(marks))
      .then(raw => {
        const data = parseJsonResult(raw);
        appendLog("OK", "attendance Drive 저장 완료");
        return refreshSlots(toIsoDate(date)).then(() => data);
      });
  };

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

  /* pywebview 환경에서 선택 날짜 슬롯 로드 */
  useEffect(() => {
    if (typeof window.__onPywebviewReady !== "function") return;
    let cancelled = false;
    const dateStr = toIsoDate(date);
    window.__onPywebviewReady(() => {
      if (!cancelled) refreshSlots(dateStr);
    });
    return () => { cancelled = true; };
  }, [date]);

  /* pywebview 환경에서 Drive 설정/시간표/명부 로드 */
  useEffect(() => {
    if (typeof window.__onPywebviewReady !== "function") return;
    window.__onPywebviewReady(() => {
      loadSetupData();
    });
  }, []);

  /* pywebview 환경에서 저장된 패스워드 로드 */
  useEffect(() => {
    if (typeof window.__onPywebviewReady !== "function") return;
    let cancelled = false;
    window.__onPywebviewReady(() => {
      window.pywebview!.api.get_password().then(pw => {
        if (!cancelled && pw) setPassword(pw);
      });
      window.pywebview!.api.get_neis_api_key().then(key => {
        if (!cancelled && key) setNeisApiKey(key);
      });
    });
    return () => { cancelled = true; };
  }, []);

  /* Apply theme / accent globally */
  useEffect(() => {
    document.documentElement.dataset.theme = tweaks.theme;
    document.documentElement.dataset.density = tweaks.density;
    document.documentElement.dataset.sidebar = tweaks.sidebarMode;
    document.documentElement.style.setProperty("--accent", tweaks.accent);
    document.documentElement.style.setProperty("--accent-hover", tweaks.accent);
    document.documentElement.style.setProperty("--accent-soft",
      tweaks.accent.startsWith("#")
        ? `${tweaks.accent}22`
        : tweaks.accent);
    document.documentElement.style.setProperty("--radius-lg", tweaks.corner + "px");
  }, [tweaks]);

  const startRun = () => {
    const pending = slots.filter(s => s.checked && !s.synced);
    if (!pending.length) { appendLog("INFO", "모든 수업이 이미 반영됨"); return; }

    /* pywebview 환경이면 Python 백엔드 호출 */
    if (window.__isPywebview && window.__isPywebview()) {
      setRunning(true);
      setProgress({ done: 0, total: pending.length, current: "", state: "running" });
      appendLog("INFO", `NEIS 반영 실행 — 대상 ${pending.length}건`);
      window.pywebview!.api.start_run(toIsoDate(date), password, closeAfter);
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

  const pendingCount = slots.filter(s => !s.synced).length;
  const navWithBadges = NAV.map(g => ({
    ...g, items: g.items.map(it => it.key === "run" ? { ...it, badge: pendingCount ? `${pendingCount}` : null } : it)
  }));
  const sidebarName = driveUser?.displayName || driveUser?.emailAddress || "교과 담당교사";
  const sidebarInitial = sidebarName.trim().slice(0, 1) || "교";
  const sidebarRole = driveUser?.emailAddress || `${settings.region} · ${settings.year}학년도 ${settings.term}학기`;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sb-head">
          <div className="sb-logo"><Icon name="school" size={22}/></div>
          <div className="sb-name-wrap">
            <div className="sb-name">출결 자동화</div>
            <div className="sb-sub">교과교사용</div>
          </div>
          <button className="sb-collapse" onClick={() => setTweaks({ sidebarMode: tweaks.sidebarMode === "collapsed" ? "expanded" : "collapsed" })} title="사이드바 접기">
            <Icon name={tweaks.sidebarMode === "collapsed" ? "chev-r" : "chev-l"} size={16}/>
          </button>
        </div>

        <div className="sb-search">
          <Icon name="search" size={14}/>
          <input placeholder="검색"/>
        </div>

        {navWithBadges.map(group => (
          <div key={group.group}>
            <div className="sb-section">{group.group}</div>
            <div className="sb-list">
              {group.items.map(it => (
                <button key={it.key}
                  className={`sb-item ${page === it.key ? "active" : ""}`}
                  onClick={() => setPage(it.key)}>
                  <span className="sb-ic"><Icon name={it.icon} size={17}/></span>
                  <span>{it.label}</span>
                  {it.badge && <span className="count">{it.badge}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="sb-foot">
          <div className="avatar">{sidebarInitial}</div>
          <div className="sb-user-wrap">
            <div className="sb-user">{sidebarName}</div>
            <div className="sb-role">{sidebarRole}</div>
          </div>
        </div>
      </aside>

      <main className="main">
        {page === "run"       && <RunView {...{date,setDate,password,setPassword,closeAfter,setCloseAfter,slots,setSlots,rosters,running,progress,runLog:logLines,startRun,saveSlotAttendance,appendLog,refreshSlots,publishNeisTimetableForMobile,slotLoading,slotError}}/>}
        {page === "basics"    && <BasicsView settings={settings} setSettings={setSettings} driveUser={driveUser} appendLog={appendLog} loadSetupData={loadSetupData} saveSettings={saveSettings}/>}
        {page === "timetable" && <TimetableView rows={timetable} setRows={setTimetable} settings={settings} setSettings={setSettings} neisApiKey={neisApiKey} setNeisApiKey={setNeisApiKey} saveNeisApiKey={saveNeisApiKey} appendLog={appendLog} loadSetupData={loadSetupData} saveSettings={saveSettings} saveTimetable={saveTimetable} previewNeisPublicTimetable={previewNeisPublicTimetable} findNeisSubjectCandidates={findNeisSubjectCandidates} publishNeisTimetableForMobile={publishNeisTimetableForMobile}/>}
        {page === "roster"    && <RosterView rosters={rosters} setRosters={setRosters} appendLog={appendLog} loadSetupData={loadSetupData} saveRosters={saveRosters} importRosterFile={importRosterFile}/>}
        {page === "drive"     && <DriveView appendLog={appendLog} driveUser={driveUser} loadSetupData={loadSetupData}/>}
        {page === "auth"      && <AuthView appendLog={appendLog} driveUser={driveUser} loadSetupData={loadSetupData}/>}
        {page === "log"       && <PlaceholderView title="실행 기록" icon="list" body="이전 실행의 성공·실패와 변경 내역을 한 번에 확인합니다."/>}
        {page === "schedule"  && <PlaceholderView title="예약 실행" icon="calendar" body="매일 지정된 시각에 자동으로 실행하도록 예약합니다."/>}
      </main>

      {tweaks.showLog && (
        <LogDock lines={logLines} collapsed={logCollapsed} setCollapsed={setLogCollapsed} clear={clearLog}/>
      )}

      <TweaksPanel>
        <TweakSection title="외관">
          <TweakRadio label="테마" value={tweaks.theme} onChange={v=>setTweaks({theme:v})}
            options={[{value:"light",label:"라이트"},{value:"dark",label:"다크"}]}/>
          <TweakColor label="액센트" value={tweaks.accent} onChange={v=>setTweaks({accent:v})}
            presets={["#0A84FF","#5E5CE6","#FF9F0A","#30D158","#BF5AF2","#FF375F"]}/>
          <TweakSlider label="모서리 둥글기" value={tweaks.corner} onChange={v=>setTweaks({corner:v})} min={6} max={28} step={1}/>
        </TweakSection>
        <TweakSection title="레이아웃">
          <TweakRadio label="사이드바" value={tweaks.sidebarMode} onChange={v=>setTweaks({sidebarMode:v})}
            options={[{value:"expanded",label:"펼침"},{value:"collapsed",label:"접힘"}]}/>
          <TweakRadio label="밀도" value={tweaks.density} onChange={v=>setTweaks({density:v})}
            options={[{value:"compact",label:"조밀"},{value:"cozy",label:"기본"},{value:"roomy",label:"넓게"}]}/>
          <TweakToggle label="하단 로그 도크" value={tweaks.showLog} onChange={v=>setTweaks({showLog:v})}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

export default App;
