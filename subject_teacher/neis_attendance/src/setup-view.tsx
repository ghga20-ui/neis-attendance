import React from "react";
import { Icon, Toggle, Segmented, PillTabs, EmptyState, Chip, Checkbox } from "./components";
import { TIMETABLE, ROSTERS } from "./data";
const { useState, useMemo, useEffect } = React;

const DAYS = ["월","화","수","목","금"];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const BasicsView = ({ settings, setSettings, driveUser, appendLog, loadSetupData, saveSettings, searchSchools }) => {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const runSchoolSearch = () => {
    const name = (settings.schoolName || "").trim();
    if (!name) { setSearchError("학교명을 먼저 입력하세요."); return; }
    setSearching(true); setSearchError(""); setCandidates([]);
    Promise.resolve(searchSchools({ region: settings.region, schoolName: name }))
      .then(res => {
        if (res && res.error) { setSearchError(String(res.error)); return; }
        const list = (res && res.schools) || [];
        setCandidates(list);
        if (!list.length) setSearchError("검색 결과가 없습니다. 학교명을 확인하세요.");
      })
      .catch(err => setSearchError(err && err.message ? err.message : String(err)))
      .finally(() => setSearching(false));
  };

  const pickSchool = (s) => {
    setSettings({ ...settings, schoolName: s.name, schoolCode: s.code, schoolKind: s.kind });
    setCandidates([]); setSearchError("");
    if (appendLog) appendLog("완료", `학교 확정: ${s.name} (${s.kind})`);
  };

  return (
    <>
      <div className="topbar">
        <Icon name="gear" size={16}/>
        <span className="title">기본 정보</span>
        <div className="topbar-actions">
          <button className="tb-btn primary" onClick={() => saveSettings()}>
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
            <div><div className="rlabel">학교</div><div className="rhint">학교를 찾아 선택하면 같은 이름 학교가 있어도 시간표를 정확히 가져와요.</div></div>
            <div className="rctrl" style={{display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
              <input className="input" style={{width:200}} value={settings.schoolName || ""}
                onChange={e => setSettings({...settings, schoolName: e.target.value, schoolCode: "", schoolKind: ""})}
                placeholder="예: 수원고등학교"/>
              <button className="tb-btn" onClick={runSchoolSearch} disabled={searching}>
                <Icon name="search" size={14}/> {searching ? "찾는 중…" : "학교 찾기"}
              </button>
              {settings.schoolCode
                ? <Chip kind="ok"><Icon name="check" size={11}/> 학교 확정 · {settings.schoolKind || "학교"}</Chip>
                : <Chip kind="gray" dot={false}>미확정</Chip>}
            </div>
            <div/>
          </div>
          {searchError && (
            <div className="form-row">
              <div><div className="rhint">안내</div></div>
              <div className="rctrl" style={{color:"#C42017", fontSize:13}}>{searchError}</div>
              <div/>
            </div>
          )}
          {candidates.length > 0 && (
            <div className="form-row">
              <div><div className="rlabel">검색 결과</div><div className="rhint">맞는 학교를 선택하세요.</div></div>
              <div className="rctrl" style={{display:"flex", flexDirection:"column", gap:6, width:"100%"}}>
                {candidates.map(s => (
                  <button key={s.code} className="tb-btn" style={{display:"flex", justifyContent:"space-between", alignItems:"center", textAlign:"left", width:"100%"}} onClick={() => pickSchool(s)}>
                    <span>
                      <strong>{s.name}</strong> · {s.kind}
                      <div style={{opacity:.7, fontSize:12, marginTop:2}}>{s.district || ""}{s.district && s.address ? " · " : ""}{s.address || ""}</div>
                    </span>
                    <span style={{flex:"0 0 auto", marginLeft:10}}><Icon name="chev-r" size={14}/> 선택</span>
                  </button>
                ))}
              </div>
              <div/>
            </div>
          )}
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
  const [subjectLookup, setSubjectLookup] = useState<any>({ index: null, loading: false, error: "", lessons: [] });
  const [advancedRows, setAdvancedRows] = useState<any>(new Set());
  const toggleAdvanced = (index) => {
    setAdvancedRows(prev => { const n = new Set(prev); n.has(index) ? n.delete(index) : n.add(index); return n; });
  };

  const filtered = rows.map((r, i) => ({...r, _i: i})).filter(r => day === "전체" || r.day === day);
  const assignedLessons = settings?.assignedLessons || [];
  const isNeisMode = (settings?.timetableMode || "neis") === "neis";

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
  return (
    <>
      <div className="topbar">
        <Icon name="board" size={16}/>
        <span className="title">시간표</span>
        <span className="sub">· {rows.length}개 수업</span>
        <div className="topbar-actions">
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
              ) : assignedLessons.map((lesson, index) => {
                const advOpen = advancedRows.has(index)
                  || Boolean(String(lesson.neisSubjectLabel || "").trim())
                  || Boolean((lesson.subjectAliases || []).length);
                return (
                <React.Fragment key={index}>
                <div className="assigned-row-basic">
                  <select className="select" value={lesson.grade} onChange={e => updateAssignedLesson(index, { grade: +e.target.value })}>
                    {[1,2,3].map(n => <option key={n} value={n}>{n}학년</option>)}
                  </select>
                  <input className="input" value={lesson.classNo} onChange={e => updateAssignedLesson(index, { classNo: e.target.value })} placeholder="반"/>
                  <input className="input" value={lesson.subjectName} onChange={e => updateAssignedLesson(index, { subjectName: e.target.value })} placeholder="과목명 · 예: 수학1"/>
                  <button className="tb-btn ghost assigned-adv-toggle" onClick={() => toggleAdvanced(index)} title="과목명이 NEIS 표기와 다를 때만 사용">
                    {advOpen ? "표시명 닫기" : "표시명 다름?"}
                  </button>
                  <button className="tb-iconbtn" onClick={() => removeAssignedLesson(index)} title="삭제"><Icon name="trash" size={15}/></button>
                </div>
                {advOpen && (
                  <div className="assigned-row-adv">
                    <input className="input" value={lesson.neisSubjectLabel} onChange={e => updateAssignedLesson(index, { neisSubjectLabel: e.target.value })} placeholder="NEIS 표시명 · 예: 수학Ⅰ"/>
                    <input className="input" value={(lesson.subjectAliases || []).join(", ")} onChange={e => updateAssignedLesson(index, { subjectAliases: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })} placeholder="별칭 · 쉼표 구분"/>
                    <button className="tb-btn assigned-check-btn" onClick={() => checkAssignedSubject(index)} disabled={subjectLookup.loading && subjectLookup.index === index}>
                      <Icon name={subjectLookup.loading && subjectLookup.index === index ? "clock" : "search"} size={14}/> 유사 표시명 찾기
                    </button>
                  </div>
                )}
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
                );
              })}
            </div>
          </div>
        )}

        {!isNeisMode && (
          <div className="manual-timetable-tabs">
          <PillTabs value={day} onChange={setDay}
            options={[{value:"전체",label:"전체"}, ...DAYS.map(d=>({value:d,label:d+"요일"}))]}/>
          </div>
        )}


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

export const PlaceholderView = ({ title, icon, body }) => (
  <>
    <div className="topbar"><Icon name={icon} size={16}/><span className="title">{title}</span></div>
    <div className="content">
      <div className="page-hero"><div><h1>{title}</h1><div className="subtitle">{body}</div></div></div>
      <EmptyState icon={icon} title="준비 중" body="이 화면은 빠르게 열람하기 위한 자리입니다."/>
    </div>
  </>
);

export const ConnectionView = ({ driveUser, reconnect, reconnecting, loadSetupData }) => {
  const connected = Boolean(driveUser?.emailAddress);
  const displayName = driveUser?.displayName || "";
  const email = driveUser?.emailAddress || "";

  return (
    <>
      <div className="topbar">
        <Icon name="cloud" size={16}/>
        <span className="title">연결</span>
        <div className="topbar-actions">
          <button className="tb-btn" onClick={loadSetupData}>
            <Icon name="refresh" size={14}/> 연결 확인
          </button>
        </div>
      </div>
      <div className="content">
        <div className="page-hero">
          <div>
            <h1>연결</h1>
            <div className="subtitle">출결 자료를 안전하게 저장·동기화하려면 연결이 필요해요.</div>
          </div>
        </div>

        <div className="card card-pad connect-status-card">
          <div className="connect-status-row">
            <div className={`connect-status-icon ${connected ? "ok" : "warn"}`}>
              <Icon name="cloud" size={24}/>
            </div>
            <div className="connect-status-info">
              <div className="connect-status-label">
                {connected ? "연결됨" : "연결이 필요해요"}
              </div>
              {connected ? (
                <div className="connect-status-account">
                  {displayName && <span className="connect-name">{displayName}</span>}
                  {displayName && email && <span className="connect-sep">·</span>}
                  {email && <span className="connect-email">{email}</span>}
                </div>
              ) : (
                <div className="connect-status-account">계정이 연결되지 않았습니다.</div>
              )}
            </div>
            <button className="tb-btn primary" disabled={reconnecting} onClick={reconnect}>
              <Icon name={reconnecting ? "clock" : "refresh"} size={14}/>
              {reconnecting ? "연결 중…" : "다시 연결"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

