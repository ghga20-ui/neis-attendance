import React from "react";
import { Icon, Toggle, Segmented, PillTabs, Banner, EmptyState, Chip, Checkbox } from "./components";
import { TIMETABLE, ROSTERS } from "./data";
const { useState, useMemo, useEffect } = React;

const DAYS = ["월","화","수","목","금"];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const accountLabel = (driveUser) => {
  if (!driveUser?.emailAddress) return "계정 확인 전";
  return driveUser.displayName
    ? `${driveUser.displayName} · ${driveUser.emailAddress}`
    : driveUser.emailAddress;
};

export const BasicsView = ({ settings, setSettings, driveUser, appendLog, loadSetupData, saveSettings }) => {
  return (
    <>
      <div className="topbar">
        <Icon name="gear" size={16}/>
        <span className="title">기본 정보</span>
        <div className="topbar-actions">
          <button className="tb-btn" onClick={loadSetupData}><Icon name="cloud" size={14}/> 불러오기</button>
          <button className="tb-btn primary" onClick={saveSettings}>
            <Icon name="check" size={14}/> 저장
          </button>
        </div>
      </div>
      <div className="content">
        <div className="page-hero">
          <div>
            <h1>기본 정보</h1>
            <div className="subtitle">학교·학기 정보와 기본값을 정리합니다.</div>
          </div>
        </div>

        <div className="list-group form-list">
          <div className="form-row">
            <div><div className="rlabel">학교명</div><div className="rhint">시간표를 자동으로 가져올 때 사용해요.</div></div>
            <div className="rctrl">
              <input className="input" style={{width:220}} value={settings.schoolName || ""} onChange={e => setSettings({...settings, schoolName: e.target.value})} placeholder="예: 수원고등학교"/>
            </div><div/>
          </div>
          <div className="form-row">
            <div><div className="rlabel">교사명</div><div className="rhint">화면 표시용입니다.</div></div>
            <div className="rctrl">
              <input className="input" style={{width:180}} value={settings.teacherName || ""} onChange={e => setSettings({...settings, teacherName: e.target.value})} placeholder="예: 박세준"/>
            </div><div/>
          </div>
          <div className="form-row">
            <div><div className="rlabel">교육청</div><div className="rhint">우리 지역 NEIS에 접속할 때 사용해요.</div></div>
            <div className="rctrl">
              <select className="select" value={settings.region} onChange={e => setSettings({...settings, region: e.target.value})}>
                {["서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주"].map(r=>
                  <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div/>
          </div>
          <div className="form-row">
            <div><div className="rlabel">학년도</div></div>
            <div className="rctrl">
              <input className="input" style={{width:140}} value={settings.year} onChange={e => setSettings({...settings, year: e.target.value})}/>
            </div><div/>
          </div>
          <div className="form-row">
            <div><div className="rlabel">학기</div></div>
            <div className="rctrl">
              <Segmented value={settings.term} onChange={v => setSettings({...settings, term: v})}
                options={[{value:"1",label:"1학기"},{value:"2",label:"2학기"}]}/>
            </div><div/>
          </div>
          <div className="form-row">
            <div><div className="rlabel">적용 시작일</div><div className="rhint">이 날짜부터 시간표가 적용됩니다.</div></div>
            <div className="rctrl">
              <input className="input" style={{width:180}} value={settings.effectiveFrom} onChange={e=>setSettings({...settings, effectiveFrom: e.target.value})}/>
            </div><div/>
          </div>
          <div className="form-row">
            <div><div className="rlabel">출결마감 자동 실행</div><div className="rhint">오늘 출결 화면의 기본값이 돼요.</div></div>
            <div className="rctrl">
              <Toggle on={settings.closeByDefault} onChange={v => setSettings({...settings, closeByDefault: v})}/>
            </div><div/>
          </div>
        </div>
      </div>
    </>
  );
};

export const TimetableView = ({ rows, setRows, settings, setSettings, neisApiKey, setNeisApiKey, saveNeisApiKey, appendLog, loadSetupData, saveSettings, saveTimetable, previewNeisPublicTimetable, findNeisSubjectCandidates, publishNeisTimetableForMobile }) => {
  const [selected, setSelected] = useState<any>(new Set());
  const [day, setDay] = useState<any>("전체");
  const [importForm, setImportForm] = useState<any>({
    schoolName: settings?.schoolName || "",
    date: todayIso(),
    grade: 2,
    classNo: "1",
    apiKey: "",
  });
  const [preview, setPreview] = useState<any>(null);
  const [previewSelected, setPreviewSelected] = useState<any>(new Set());
  const [previewLoading, setPreviewLoading] = useState<any>(false);
  const [previewError, setPreviewError] = useState<any>("");
  const [subjectLookup, setSubjectLookup] = useState<any>({ index: null, loading: false, error: "", lessons: [] });

  const filtered = rows.map((r, i) => ({...r, _i: i})).filter(r => day === "전체" || r.day === day);
  const assignedLessons = settings?.assignedLessons || [];
  const isNeisMode = (settings?.timetableMode || "neis") === "neis";

  useEffect(() => {
    if (!importForm.schoolName && settings?.schoolName) {
      setImportForm(form => ({ ...form, schoolName: settings.schoolName }));
    }
  }, [settings?.schoolName]);

  const addRow = () => {
    const targetDay = day === "전체" ? "월" : day;
    const next = [...rows, {day: targetDay, period:1, grade:2, classNo:"1", subject:"", neis:""}];
    setRows(next);
    if (day === "전체") setDay(targetDay);
  };
  const removeSelected = () => {
    const keep = rows.filter((_, i) => !selected.has(i));
    setRows(keep); setSelected(new Set());
    appendLog("OK", "선택된 행 삭제됨");
  };
  const updateRow = (i, patch) => {
    setRows(rows.map((r, idx) => idx === i ? {...r, ...patch} : r));
  };
  const toggle = (i) => {
    const n = new Set(selected);
    n.has(i) ? n.delete(i) : n.add(i);
    setSelected(n);
  };
  const updateAssignedLesson = (index, patch) => {
    const next = assignedLessons.map((lesson, i) => i === index ? { ...lesson, ...patch } : lesson);
    setSettings({ ...settings, assignedLessons: next });
  };
  const addAssignedLesson = () => {
    setSettings({
      ...settings,
      assignedLessons: [
        ...assignedLessons,
        { grade: 2, classNo: "1", subjectName: "", neisSubjectLabel: "", subjectAliases: [] },
      ],
    });
  };
  const removeAssignedLesson = (index) => {
    setSettings({ ...settings, assignedLessons: assignedLessons.filter((_, i) => i !== index) });
  };
  const checkAssignedSubject = (index) => {
    const lesson = assignedLessons[index];
    if (!lesson || !String(lesson.subjectName || "").trim()) {
      appendLog("ERR", "과목명을 먼저 입력해 주세요");
      return;
    }
    setSubjectLookup({ index, loading: true, error: "", lessons: [] });
    findNeisSubjectCandidates({
      region: settings?.region,
      schoolName: settings?.schoolName,
      date: todayIso(),
      grade: lesson.grade,
      classNo: lesson.classNo,
      subjectName: lesson.subjectName,
    })
      .then(data => {
        const candidates = data.candidates || [];
        setSubjectLookup({ index, loading: false, error: "", lessons: candidates, scope: data.scope || "" });
        appendLog("OK", `유사 NEIS 표시명 후보 ${candidates.length}건 조회`);
      })
      .catch(err => {
        const message = err.message || String(err);
        setSubjectLookup({ index, loading: false, error: message, lessons: [] });
        appendLog("ERR", `유사 NEIS 표시명 후보 조회 실패: ${message}`);
      });
  };
  const applyAssignedSubject = (index, subject) => {
    const lesson = assignedLessons[index] || {};
    updateAssignedLesson(index, {
      subjectName: lesson.subjectName || subject,
      neisSubjectLabel: subject,
    });
    setSubjectLookup({ index: null, loading: false, error: "", lessons: [] });
    appendLog("OK", `NEIS 표시명 적용: ${subject}`);
  };
  const saveNeisModeSettings = () => {
    const validLessons = assignedLessons.filter(lesson =>
      String(lesson.classNo || "").trim() && String(lesson.subjectName || "").trim()
    );
    if (!validLessons.length) {
      appendLog("ERR", "담당 수업을 최소 1건 입력해 주세요");
      return;
    }
    if (String(neisApiKey || "").trim()) {
      saveNeisApiKey();
    }
    Promise.resolve(saveSettings(`담당 수업 ${validLessons.length}건 저장 완료`))
      .then(() => publishNeisTimetableForMobile && publishNeisTimetableForMobile(undefined, { force: true }));
  };
  const fetchPreview = () => {
    setPreviewLoading(true);
    setPreviewError("");
    setPreview(null);
    setPreviewSelected(new Set());
    previewNeisPublicTimetable({
      region: settings?.region,
      schoolName: importForm.schoolName,
      date: importForm.date,
      grade: importForm.grade,
      classNo: importForm.classNo,
      apiKey: importForm.apiKey,
    })
      .then(data => {
        setPreview(data);
        setPreviewSelected(new Set((data.lessons || []).map((_, index) => index)));
        appendLog("OK", `NEIS 공개 API 시간표 후보 ${(data.lessons || []).length}건 조회`);
      })
      .catch(err => {
        const message = err.message || String(err);
        setPreviewError(message);
        appendLog("ERR", `NEIS 공개 API 시간표 조회 실패: ${message}`);
      })
      .finally(() => setPreviewLoading(false));
  };
  const applyPreview = () => {
    const lessons = (preview?.lessons || []).filter((_, index) => previewSelected.has(index));
    if (!lessons.length) {
      appendLog("WARN", "반영할 시간표 후보를 선택해 주세요");
      return;
    }
    let next = [...rows];
    lessons.forEach(lesson => {
      const normalized = {
        day: lesson.day,
        period: Number(lesson.period),
        grade: Number(lesson.grade),
        classNo: String(lesson.classNo),
        subject: lesson.subject,
        neis: lesson.neis || lesson.subject,
      };
      const existingIndex = next.findIndex(row =>
        row.day === normalized.day &&
        Number(row.period) === normalized.period &&
        Number(row.grade) === normalized.grade &&
        String(row.classNo) === normalized.classNo
      );
      if (existingIndex >= 0) {
        next[existingIndex] = { ...next[existingIndex], ...normalized };
      } else {
        next.push(normalized);
      }
    });
    setRows(next);
    setDay(lessons[0].day || "전체");
    appendLog("OK", `시간표 후보 ${lessons.length}건 반영`);
  };
  const togglePreview = (index) => {
    const next = new Set(previewSelected);
    next.has(index) ? next.delete(index) : next.add(index);
    setPreviewSelected(next);
  };

  return (
    <>
      <div className="topbar">
        <Icon name="board" size={16}/>
        <span className="title">시간표</span>
        <span className="sub">· {rows.length}개 수업</span>
        <div className="topbar-actions">
          <button className="tb-btn" onClick={loadSetupData}><Icon name="cloud" size={14}/> Drive에서 불러오기</button>
          {!isNeisMode && <button className="tb-btn" onClick={addRow}><Icon name="plus" size={14}/> 행 추가</button>}
          {selected.size > 0 && (
            <button className="tb-btn" onClick={removeSelected}><Icon name="trash" size={14}/> 선택 삭제 ({selected.size})</button>
          )}
          <button className="tb-btn primary" onClick={isNeisMode ? saveNeisModeSettings : saveTimetable}>
            <Icon name="check" size={14}/> {isNeisMode ? "담당 수업 저장" : "시간표 저장"}
          </button>
        </div>
      </div>
      <div className="content">
        <div className="page-hero">
          <div>
            <h1>시간표</h1>
            <div className="subtitle">
              {isNeisMode
                ? "담당 학급과 과목을 기준으로 선택 날짜의 NEIS 시간표를 실시간 조회합니다."
                : "요일, 교시, 학년, 반, 과목명을 직접 입력해 고정 시간표로 사용합니다."}
            </div>
          </div>
          <Segmented value={settings?.timetableMode || "neis"} onChange={v => setSettings({ ...settings, timetableMode: v })}
            options={[{value:"manual",label:"직접 입력"},{value:"neis",label:"NEIS 실시간 조회"}]}/>
        </div>

        {isNeisMode && (
          <div className="card card-pad neis-mode-card">
            <div className="section-head" style={{marginBottom:12}}>
              <div>
                <h2>담당 수업</h2>
                <div className="desc">실행 화면에서 선택한 날짜의 NEIS 시간표를 조회하고, 아래 학급·과목과 맞는 수업만 표시합니다.</div>
              </div>
              <button className="tb-btn" onClick={addAssignedLesson}><Icon name="plus" size={14}/> 담당 수업 추가</button>
            </div>
            <div className="api-key-row">
              <div className="field">
                <label>NEIS Open API 키</label>
                <input className="input" type="password" value={neisApiKey} onChange={e => setNeisApiKey(e.target.value)} placeholder="로컬에만 저장됩니다"/>
              </div>
              <button className="tb-btn" onClick={saveNeisApiKey}><Icon name="check" size={14}/> API 키 저장</button>
            </div>
            <div className="mode-help">
              담당 수업 추가 후 학년·반·과목명을 입력하고 상단의 담당 수업 저장을 누르면 Drive settings.json에 저장됩니다. 실행 화면은 선택한 날짜 기준으로 NEIS 시간표를 다시 조회합니다.
            </div>
            <div className="assigned-list">
              {assignedLessons.length === 0 ? (
                <EmptyState icon="board" title="담당 수업이 없어요" body="학년, 반, 과목을 추가하면 선택 날짜 기준으로 NEIS 시간표에서 자동 조회합니다."/>
              ) : assignedLessons.map((lesson, index) => (
                <React.Fragment key={index}>
                <div className="assigned-row">
                  <select className="select" value={lesson.grade} onChange={e => updateAssignedLesson(index, { grade: +e.target.value })}>
                    {[1,2,3].map(n => <option key={n} value={n}>{n}학년</option>)}
                  </select>
                  <input className="input" value={lesson.classNo} onChange={e => updateAssignedLesson(index, { classNo: e.target.value })} placeholder="반"/>
                  <input className="input" value={lesson.subjectName} onChange={e => updateAssignedLesson(index, { subjectName: e.target.value })} placeholder="내 과목명 · 예: 수학1"/>
                  <input className="input" value={lesson.neisSubjectLabel} onChange={e => updateAssignedLesson(index, { neisSubjectLabel: e.target.value })} placeholder="NEIS 표시명 · 예: 수학Ⅰ"/>
                  <input className="input" value={(lesson.subjectAliases || []).join(", ")} onChange={e => updateAssignedLesson(index, { subjectAliases: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })} placeholder="별칭 · 쉼표 구분"/>
                  <button className="tb-btn assigned-check-btn" onClick={() => checkAssignedSubject(index)} disabled={subjectLookup.loading && subjectLookup.index === index}>
                    <Icon name={subjectLookup.loading && subjectLookup.index === index ? "clock" : "search"} size={14}/> 유사 표시명 찾기
                  </button>
                  <button className="tb-iconbtn" onClick={() => removeAssignedLesson(index)} title="삭제"><Icon name="trash" size={15}/></button>
                </div>
                {subjectLookup.index === index && (
                  <div className="assigned-lookup-panel">
                    {subjectLookup.loading ? (
                      <span>해당 학년 NEIS 시간표에서 입력 과목명과 유사한 후보를 찾는 중입니다.</span>
                    ) : subjectLookup.error ? (
                      <span className="lookup-error">{subjectLookup.error}</span>
                    ) : subjectLookup.lessons.length === 0 ? (
                      <span>유사한 NEIS 과목명을 찾지 못했습니다. NEIS 표시명을 직접 입력하세요.</span>
                    ) : (
                      <>
                        <strong>{subjectLookup.scope === "class" ? "해당 학급 후보" : "해당 학년 후보"}</strong>
                        <div className="lookup-options">
                          {subjectLookup.lessons.map((candidate, candidateIndex) => (
                            <button key={`${candidate.subject}-${candidateIndex}`} className="tb-btn" onClick={() => applyAssignedSubject(index, candidate.subject)}>
                              {candidate.subject}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {!isNeisMode && (
          <div className="manual-timetable-tabs">
          <PillTabs value={day} onChange={setDay}
            options={[{value:"전체",label:"전체"}, ...DAYS.map(d=>({value:d,label:d+"요일"}))]}/>
          </div>
        )}

        {!isNeisMode && false && <div className="card card-pad neis-import">
          <div className="section-head" style={{marginBottom:12}}>
            <div>
              <h2>NEIS 공개 API에서 가져오기</h2>
              <div className="desc">학교·학년·반·날짜 기준 시간표를 조회한 뒤 내 수업만 선택해서 반영합니다.</div>
            </div>
            <button className="tb-btn primary" onClick={fetchPreview} disabled={previewLoading}>
              <Icon name={previewLoading ? "clock" : "cloud"} size={14}/> {previewLoading ? "조회 중..." : "후보 조회"}
            </button>
          </div>
          <div className="neis-import-grid">
            <div className="field">
              <label>학교명</label>
              <input className="input" value={importForm.schoolName} onChange={e => setImportForm({...importForm, schoolName: e.target.value})} placeholder="예: 수원고등학교"/>
            </div>
            <div className="field">
              <label>날짜</label>
              <input className="input" type="date" value={importForm.date} onChange={e => setImportForm({...importForm, date: e.target.value})}/>
            </div>
            <div className="field">
              <label>학년</label>
              <select className="select" value={importForm.grade} onChange={e => setImportForm({...importForm, grade: +e.target.value})}>
                {[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="field">
              <label>반</label>
              <input className="input" value={importForm.classNo} onChange={e => setImportForm({...importForm, classNo: e.target.value})}/>
            </div>
            <div className="field">
              <label>API 키</label>
              <input className="input" value={importForm.apiKey} onChange={e => setImportForm({...importForm, apiKey: e.target.value})} placeholder="선택 · 없으면 일부만 조회될 수 있음"/>
            </div>
          </div>
          {previewError && <div className="inline-error">{previewError}</div>}
          {preview && (
            <div className="neis-preview">
              <div className="neis-preview-head">
                <strong>{preview.school?.name || importForm.schoolName}</strong>
                <span>{preview.date} · 후보 {(preview.lessons || []).length}건</span>
                <button className="tb-btn" onClick={applyPreview}>
                  <Icon name="check" size={14}/> 선택 반영 ({previewSelected.size})
                </button>
              </div>
              {(preview.lessons || []).length === 0 ? (
                <div className="desc">조회된 시간표가 없습니다. 날짜, 학년, 반을 확인하세요.</div>
              ) : (
                <div className="neis-preview-list">
                  {preview.lessons.map((lesson, index) => (
                    <button key={`${lesson.period}-${lesson.subject}-${index}`} className="neis-preview-row" onClick={() => togglePreview(index)}>
                      <span className={`cbx-box ${previewSelected.has(index) ? "on" : ""}`}>
                        {previewSelected.has(index) && <Icon name="check" size={12} stroke={2.4}/>}
                      </span>
                      <span>{lesson.day}</span>
                      <strong>{lesson.period}교시</strong>
                      <span>{lesson.grade}-{lesson.classNo}</span>
                      <span>{lesson.subject}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>}

        {!isNeisMode && <div className="list-group manual-timetable-list" style={{overflow:"hidden"}}>
          <div className="tt-grid head">
            <div/>
            <div>요일</div>
            <div>교시</div>
            <div>학년</div>
            <div>반</div>
            <div>과목명</div>
            <div/>
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon="board" title="이 요일에는 수업이 없어요" body="위의 행 추가 버튼으로 수업 슬롯을 추가하세요."/>
          ) : filtered.map(r => (
            <div key={r._i} className="tt-grid">
              <Checkbox checked={selected.has(r._i)} onChange={() => toggle(r._i)}/>
              <div className="cell-input">
                <select className="select" value={r.day} onChange={e => updateRow(r._i, {day: e.target.value})}>
                  {DAYS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="cell-input">
                <select className="select" value={r.period} onChange={e => updateRow(r._i, {period: +e.target.value})}>
                  {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="cell-input">
                <select className="select" value={r.grade} onChange={e => updateRow(r._i, {grade: +e.target.value})}>
                  {[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="cell-input">
                <input className="input" value={r.classNo} onChange={e => updateRow(r._i, {classNo: e.target.value})}/>
              </div>
              <div className="cell-input">
                <input className="input" value={r.subject} placeholder="과목명" onChange={e => updateRow(r._i, {subject: e.target.value})}/>
                <details className="neis-override">
                  <summary>NEIS 표시명이 다를 때만 수정</summary>
                  <input
                    className="input"
                    value={r.neis}
                    placeholder="비워두면 과목명과 같음"
                    onChange={e => updateRow(r._i, {neis: e.target.value})}
                  />
                </details>
              </div>
              <button className="tb-iconbtn" title="행 삭제" onClick={() => { setRows(rows.filter((_, idx) => idx !== r._i)); appendLog("WARN", "시간표 행 1개 삭제"); }}>
                <Icon name="trash" size={15}/>
              </button>
            </div>
          ))}
        </div>}
      </div>
    </>
  );
};

export const RosterView = ({ rosters, setRosters, appendLog, loadSetupData, saveRosters, importRosterFile }) => {
  const keys = Object.keys(rosters);
  const [klass, setKlass] = useState<any>(keys[0]);
  const [paste, setPaste] = useState<any>("");
  const list = rosters[klass] || [];

  useEffect(() => {
    if (!klass || !rosters[klass]) {
      setKlass(keys[0] || "");
    }
  }, [klass, keys.join("\t"), rosters]);

  const addStudent = () => {
    if (!klass) {
      appendLog("ERR", "시간표에서 학급을 먼저 추가해 주세요");
      return;
    }
    setRosters({...rosters, [klass]: [...list, {n: list.length + 1, name: ""}]});
  };
  const update = (i, patch) => setRosters({...rosters, [klass]: list.map((s, idx) => idx === i ? {...s, ...patch} : s)});
  const remove = (i) => setRosters({...rosters, [klass]: list.filter((_, idx) => idx !== i)});

  const importPaste = () => {
    if (!klass) {
      appendLog("ERR", "시간표에서 학급을 먼저 추가해 주세요");
      return;
    }
    const rows = paste.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
      const [n, ...rest] = l.split(/\s+/);
      return { n: parseInt(n, 10), name: rest.join(" ") };
    }).filter(r => !isNaN(r.n) && r.name);
    setRosters({...rosters, [klass]: rows});
    setPaste("");
    appendLog("OK", `${klass} 명부 ${rows.length}명 가져옴`);
  };

  return (
    <>
      <div className="topbar">
        <Icon name="users" size={16}/>
        <span className="title">학생 명부</span>
        <span className="sub">· {keys.length}개 학급 · 선택 학급 {list.length}명</span>
        <div className="topbar-actions">
          <button className="tb-btn" onClick={loadSetupData}><Icon name="cloud" size={14}/> Drive에서 불러오기</button>
          <button className="tb-btn" onClick={() => importRosterFile(klass)} disabled={!klass}>
            <Icon name="upload" size={14}/> CSV/XLSX 가져오기
          </button>
          <button className="tb-btn primary" onClick={saveRosters}>
            <Icon name="check" size={14}/> 명부 저장
          </button>
        </div>
      </div>
      <div className="content">
        <div className="page-hero">
          <div>
            <h1>학생 명부</h1>
            <div className="subtitle">학급 목록은 시간표의 학년-반과 자동으로 맞춰집니다.</div>
          </div>
          <PillTabs value={klass} onChange={setKlass} options={keys.map(k => ({value:k, label:k}))}/>
        </div>

        <div className="card card-pad" style={{marginBottom:16}}>
          <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                <Icon name="paste" size={16}/> 붙여넣기로 빠르게 채우기
              </div>
              <div style={{fontSize:12,color:"var(--fg-3)",marginBottom:10}}>
                각 줄을 <span className="kbd">번호 이름</span> 형식으로 입력하거나, 상단의 CSV/XLSX 가져오기로 <span className="kbd">번호, 이름</span> 열을 불러오세요.
              </div>
              <textarea className="textarea" rows={4} value={paste} onChange={e=>setPaste(e.target.value)}
                placeholder="1 김도윤&#10;2 김민서&#10;3 김서준…"/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,paddingTop:24}}>
              <button className="tb-btn primary" onClick={importPaste} disabled={!paste.trim()}>
                <Icon name="check" size={14}/> 반영
              </button>
              <button className="tb-btn" onClick={() => setPaste("")}>
                <Icon name="x" size={14}/> 지우기
              </button>
            </div>
          </div>
        </div>

        <div className="list-group">
          <div className="sr-grid head">
            <div/><div>번호</div><div>이름</div><div/>
          </div>
          {list.length === 0 ? (
            <EmptyState icon="users" title={klass ? "아직 학생이 없어요" : "시간표 학급이 없어요"} body={klass ? "붙여넣기나 CSV/XLSX 가져오기로 명부를 채우세요." : "시간표에서 수업 학급을 먼저 추가하면 명부 탭이 자동으로 생깁니다."}/>
          ) : list.map((s, i) => (
            <div key={i} className="sr-grid">
              <div/>
              <div className="num">
                <input className="input" style={{padding:"6px 10px"}} value={s.n} onChange={e=>update(i, {n: +e.target.value})}/>
              </div>
              <div>
                <input className="input" style={{padding:"6px 10px"}} value={s.name} onChange={e=>update(i, {name: e.target.value})}/>
              </div>
              <button className="tb-iconbtn" onClick={() => remove(i)} title="삭제"><Icon name="trash" size={15}/></button>
            </div>
          ))}
          <div style={{padding:10,borderTop:"1px solid var(--sep)"}}>
            <button className="tb-btn ghost" onClick={addStudent} disabled={!klass}><Icon name="plus" size={14}/> 학생 추가</button>
          </div>
        </div>
      </div>
    </>
  );
};

export const DriveView = ({ appendLog, driveUser, loadSetupData }) => (
  <>
    <div className="topbar">
      <Icon name="cloud" size={16}/>
      <span className="title">Google Drive</span>
      <div className="topbar-actions">
        <button className="tb-btn" onClick={loadSetupData}><Icon name="refresh" size={14}/> 연결 확인</button>
      </div>
    </div>
    <div className="content">
      <div className="page-hero">
        <div><h1>Google Drive</h1><div className="subtitle">이 앱 전용 비공개 영역에 저장된 설정·시간표·학생 명부를 관리합니다.</div></div>
      </div>
      <Banner kind="info" icon="info" title="이 앱 전용 비공개 저장 공간 — 다른 사람이 Google Drive에서 볼 수 없습니다">
        현재 연결 계정: {accountLabel(driveUser)}
      </Banner>
      <div className="list-group" style={{marginTop:16}}>
        {[
          {name:"settings.json", size:"412 B", ts:"2026.04.18 09:12", icon:"gear"},
          {name:"timetable.json", size:"2.1 KB", ts:"2026.04.18 09:12", icon:"board"},
          {name:"students.json",  size:"5.3 KB", ts:"2026.04.18 09:12", icon:"users"},
        ].map(f => (
          <div key={f.name} className="list-row" style={{gridTemplateColumns:"auto 1fr auto auto auto"}}>
            <div className="period"><span className="p-num" style={{background:"var(--accent-soft)",color:"var(--accent)"}}><Icon name={f.icon} size={14}/></span></div>
            <div className="subject">{f.name}<div className="sub2">앱 전용 저장소</div></div>
            <div className="klass">{f.size}</div>
            <div className="klass">{f.ts}</div>
            <button className="tb-btn ghost" onClick={() => appendLog("INFO", `${f.name} 다운로드`)}>다운로드</button>
          </div>
        ))}
      </div>
    </div>
  </>
);

export const AuthView = ({ appendLog, driveUser, loadSetupData }) => (
  <>
    <div className="topbar">
      <Icon name="key" size={16}/>
      <span className="title">Google 계정 연결</span>
    </div>
    <div className="content">
      <div className="page-hero"><div><h1>Google 계정 연결</h1><div className="subtitle">이 앱이 Google Drive에 파일을 저장하려면 계정 연결이 필요합니다.</div></div></div>
      <div className="card card-pad">
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:44,height:44,borderRadius:12,background:"var(--accent-soft)",display:"grid",placeItems:"center",color:"var(--accent)"}}>
            <Icon name="lock" size={22}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600}}>{accountLabel(driveUser)}</div>
            <div style={{fontSize:13,color:"var(--fg-3)"}}>Drive 파일 저장 권한</div>
          </div>
          <button className="tb-btn primary" onClick={loadSetupData}>
            <Icon name="refresh" size={14}/> 계정 확인
          </button>
        </div>
      </div>
    </div>
  </>
);

export const PlaceholderView = ({ title, icon, body }) => (
  <>
    <div className="topbar"><Icon name={icon} size={16}/><span className="title">{title}</span></div>
    <div className="content">
      <div className="page-hero"><div><h1>{title}</h1><div className="subtitle">{body}</div></div></div>
      <EmptyState icon={icon} title="준비 중" body="이 화면은 빠르게 열람하기 위한 자리입니다."/>
    </div>
  </>
);

