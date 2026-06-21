import React from "react";
import { Icon, Chip, StatusChip, Checkbox, Ring, Bar, Banner, EmptyState, Toggle, Segmented } from "./components";
import { TODAY_SLOTS, ROSTERS } from "./data";
const { useState, useEffect, useMemo } = React;

const formatSavedAt = (isoDate) => {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `마지막 저장 ${hh}:${mm}`;
};

const summarizeMarks = (marks) => {
  const items = Object.entries(marks || {})
    .filter(([, mark]) => mark && mark !== "present")
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([number, mark]) => `${number}번 ${mark === "excused" ? "출석인정" : "결과"}`);
  return items.length ? items.join(", ") : "저장하면 전원 출석";
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return todayIso();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDateHeading = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "날짜 선택";
  const day = ["일","월","화","수","목","금","토"][d.getDay()];
  if (isoDate === todayIso()) return `오늘, ${day}요일`;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일, ${day}요일`;
};

const formatDateSubtext = (isoDate) => {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

/* Student-check sheet (modal) */
const ClassSheet = ({ slot, rosters, onClose, onSaveMarks, currentMarks, appendLog }) => {
  const students = rosters[slot.roster] || ROSTERS[slot.roster] || [];
  const [marks, setMarks] = useState<any>(() => ({ ...currentMarks }));
  const [filter, setFilter] = useState<any>("all");
  const [saving, setSaving] = useState<any>(false);
  const [saveError, setSaveError] = useState<any>("");

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, excused: 0, unset: 0 };
    students.forEach(s => {
      const m = marks[s.n] || "present";
      c[m] = (c[m] || 0) + 1;
    });
    return c;
  }, [marks, students]);

  const setAll = (m) => {
    const next = {};
    students.forEach(s => next[s.n] = m);
    setMarks(next);
  };

  const toggle = (n) => {
    const cur = marks[n] || "present";
    const order = ["present", "absent", "excused"];
    const next = order[(order.indexOf(cur) + 1) % order.length];
    setMarks(m => ({ ...m, [n]: next }));
  };

  const save = () => {
    setSaving(true);
    setSaveError("");
    Promise.resolve(onSaveMarks(slot.id, marks, counts))
      .then(() => {
        appendLog("OK", `${slot.grade}-${slot.classNo} ${slot.subject} Drive 저장 완료 (결과 ${counts.absent}, 출석인정 ${counts.excused})`);
        onClose();
      })
      .catch(err => {
        const message = err.message || String(err);
        setSaveError(message);
        appendLog("ERR", `출결 저장 실패: ${message}`);
      })
      .finally(() => setSaving(false));
  };

  const filtered = filter === "all" ? students : students.filter(s => (marks[s.n] || "present") === filter);

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <div>
            <div className="st-t">{slot.period}교시 · {slot.subject}</div>
            <div className="st-s">{slot.grade}학년 {slot.classNo}반 · {slot.room} · {slot.time}</div>
          </div>
          <button className="tb-iconbtn" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="sheet-body">
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
            <Chip kind="info">총 {students.length}명</Chip>
            <Chip kind="ok">출석 {counts.present}</Chip>
            <Chip kind="bad">결과 {counts.absent}</Chip>
            <Chip kind="warn">출석인정 {counts.excused}</Chip>
            <div style={{flex:1}}/>
            <button className="tb-btn ghost" onClick={() => setAll("present")}>
              <Icon name="check" size={14}/> 전원 출석
            </button>
          </div>

          <div className="mark-legend">
            {[
              ["all", "전체", "var(--fg-3)"],
              ["present", "출석", "var(--green)"],
              ["absent", "결과(/)", "var(--red)"],
              ["excused", "출석인정(∅)", "var(--orange)"],
            ].map(([v, l, c]) => (
              <button key={v} className={filter === v ? "on" : ""} onClick={() => setFilter(v)}>
                <span className="dot" style={{background: c}}/>{l}
              </button>
            ))}
          </div>

          <div className="save-summary-box">
            <strong>저장 전 요약</strong>
            <span>{summarizeMarks(marks)}</span>
          </div>
          {saveError && (
            <div className="save-summary-box error">
              <strong>Drive 저장 실패</strong>
              <span>{saveError}</span>
            </div>
          )}

          <div className="stu-grid">
            {filtered.map(s => {
              const m = marks[s.n] || "present";
              return (
                <div key={s.n} className="stu-row" data-mark={m} onClick={() => toggle(s.n)}>
                  <span className="n">{s.n}</span>
                  <span className="nm">{s.name}</span>
                  <span className="state">
                    {m === "present" && <Icon name="check" size={12}/>}
                    {m === "absent"  && <Icon name="x" size={12}/>}
                    {m === "excused" && "∅"}
                  </span>
                </div>
              );
            })}
          </div>
          <p style={{fontSize:12,color:"var(--fg-3)",marginTop:14}}>학생 행을 눌러 출석 → 결과(/) → 출석인정(∅) 순서로 변경할 수 있어요.</p>
        </div>
        <div className="sheet-foot">
          <button className="tb-btn" onClick={onClose} disabled={saving}>취소</button>
          <button className="tb-btn primary" onClick={save} disabled={saving}>
            <Icon name={saving ? "clock" : "check"} size={14}/> {saving ? "Drive 저장 중..." : "Drive에 저장"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const RunView = ({ date, setDate, password, setPassword, closeAfter, setCloseAfter,
                   slots, setSlots, rosters, running, progress, runLog, startRun, saveSlotAttendance, appendLog, refreshSlots, publishNeisTimetableForMobile, slotLoading, slotError }) => {
  const [openSlot, setOpenSlot] = useState<any>(null);
  const [marksById, setMarksById] = useState<any>({});

  const total = slots.length;
  const checked = slots.filter(s => s.checked).length;
  const synced = slots.filter(s => s.synced).length;
  const pending = slots.filter(s => s.checked && !s.synced).length;
  const absent = slots.reduce((a, s) => a + (s.absences || 0), 0);

  const onSaveMarks = (id, marks, counts) => {
    const absCount = counts ? counts.absent + counts.excused : Object.values(marks).filter(v => v && v !== "present").length;
    return Promise.resolve(saveSlotAttendance(id, marks)).then((saved) => {
      const checkedAt = saved?.checkedAt || new Date().toISOString();
      setMarksById(m => ({ ...m, [id]: marks }));
      setSlots(prev => prev.map(s => s.id === id ? { ...s, checked: true, absences: absCount, checkedAt, marks, note: absCount ? `결과·출석인정 ${absCount}명` : "전원 출석" } : s));
    });
  };

  return (
    <>
      <div className="topbar">
        <Icon name="bolt" size={16}/>
        <span className="title">실행</span>
        <span className="sub">· 선택한 날짜의 수업을 확인하고 NEIS에 반영합니다</span>
        <div className="topbar-actions">
          <button className="tb-btn" onClick={() => {
            const publish = publishNeisTimetableForMobile
              ? publishNeisTimetableForMobile(date, { force: true, silent: true })
              : Promise.resolve();
            Promise.resolve(publish).then(() => {
              if (refreshSlots) return refreshSlots(date);
              return null;
            });
          }} disabled={slotLoading}>
            <Icon name={slotLoading ? "clock" : "refresh"} size={14}/> {slotLoading ? "불러오는 중" : "새로고침"}
          </button>
          <span className="divider"/>
          <Checkbox checked={closeAfter} onChange={setCloseAfter} label="출결마감까지"/>
          <button className="run-cta" onClick={startRun} disabled={running || pending === 0}>
            {running
              ? <><Icon name="clock" size={16}/> 반영 중… {progress.done}/{progress.total}</>
              : pending === 0
                ? <><Icon name="check" size={14}/> 모두 반영됨</>
                : <><Icon name="play" size={14}/> NEIS 반영 실행 · {pending}건</>}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="page-hero">
          <div>
            <h1>{formatDateHeading(date)}</h1>
            <div className="subtitle">{date} · Drive에서 확인한 출결을 NEIS 과목별 출결관리에 그대로 반영합니다.</div>
          </div>
          <div className="hero-actions date-actions">
            <button className="tb-btn" onClick={() => setDate(addDays(date, -1))}><Icon name="chev-l" size={14}/> 이전날</button>
            <button className="tb-btn" onClick={() => setDate(todayIso())}><Icon name="calendar" size={14}/> 오늘</button>
            <button className="tb-btn" onClick={() => setDate(addDays(date, 1))}>다음날 <Icon name="chev-r" size={14}/></button>
            <div className="field date-field">
              <label>날짜 선택</label>
              <input className="input" type="date" value={date} onChange={e => setDate(e.target.value || todayIso())} />
            </div>
            <div className="field" style={{width:200}}>
              <label>교사 인증서 비밀번호</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"/>
            </div>
          </div>
        </div>

        {(running || progress.state === "done") && (
          <div className="inline-progress">
            <div className="ip-row">
              <strong>
                {running ? "NEIS 반영 중" : "마지막 실행 완료"}
              </strong>
              {progress.current && <span className="ip-cur">· {progress.current}</span>}
              <span className="ip-count">{progress.done}/{progress.total} ({Math.round(progress.done/Math.max(progress.total,1)*100)}%)</span>
            </div>
            <Bar pct={progress.total ? progress.done/progress.total*100 : 0} ok={progress.state==="done"}/>
          </div>
        )}

        {pending > 0 && !running && (
          <Banner kind="info" icon="info" title={`${pending}건의 수업이 아직 NEIS에 반영되지 않았습니다`}>
            하단의 NEIS 반영 실행 버튼으로 한 번에 처리할 수 있어요.
          </Banner>
        )}

        {slotLoading && (
          <Banner kind="info" icon="clock" title="수업을 불러오는 중입니다">
            Google Drive 출결 기록과 NEIS 공개 API 시간표를 확인하고 있습니다.
          </Banner>
        )}

        {slotError && !slotLoading && (
          <Banner kind="error" icon="info" title="수업을 불러오지 못했습니다">
            {slotError}
          </Banner>
        )}

        <div className="stat-grid" style={{marginTop:16}}>
          <div className="stat-card success">
            <div className="label"><span className="dot" style={{background:"var(--green)"}}/>연결 상태</div>
            <div className="value">연결됨</div>
            <div className="note ok">Google Drive · appDataFolder</div>
          </div>
          <div className="stat-card accent">
            <div className="label"><span className="dot"/>해당 날짜 수업</div>
            <div className="value">{total}<span className="unit">건</span></div>
            <div className="note">{formatDateSubtext(date)} · 체크 완료 {checked} / 체크 대기 {total - checked}</div>
          </div>
          <div className="stat-card">
            <div className="label"><span className="dot" style={{background:"var(--orange)"}}/>NEIS 반영</div>
            <div className="value">{synced}<span className="unit">/ {total}</span></div>
            <div className="note warn">{pending > 0 ? `미반영 ${pending}건` : "모두 반영됨"}</div>
          </div>
          <div className="stat-card">
            <div className="label"><span className="dot" style={{background:"var(--red)"}}/>결과·출석인정</div>
            <div className="value">{absent}<span className="unit">명</span></div>
            <div className="note">해당 날짜 기준 누계</div>
          </div>
        </div>

        <div className="section">
          <div className="section-head">
            <div>
              <h2>해당 날짜 수업</h2>
              <div className="desc">카드를 누르면 학생별 출결을 확인하고 바로 수정할 수 있어요.</div>
            </div>
            <div className="section-head-actions">
              <Segmented value="all" onChange={()=>{}} options={[
                {value:"all", label:"전체"},
                {value:"pending", label:`미반영 ${pending}`},
                {value:"done", label:"반영됨"},
              ]}/>
            </div>
          </div>

          <div className="list-group">
            <div className="list-header" style={{gridTemplateColumns:"80px 1.6fr 80px 80px 130px 1fr auto"}}>
              <div>교시</div>
              <div>과목 · NEIS 표시명</div>
              <div>학년</div>
              <div>반</div>
              <div>체크</div>
              <div>상태</div>
              <div></div>
            </div>
            {slotLoading ? (
              <EmptyState icon="clock" title="수업을 불러오는 중입니다"
                body="Drive 출결 기록과 NEIS 시간표를 확인하고 있습니다." />
            ) : slots.length === 0 ? (
              <EmptyState icon="calendar" title="해당 날짜에 표시할 수업이 없습니다"
                body="시간표 탭의 담당 수업, 과목명, 학년·반 또는 선택 날짜를 확인하세요." />
            ) : slots.map(s => (
              <div key={s.id} className="list-row" style={{gridTemplateColumns:"80px 1.6fr 80px 80px 130px 1fr auto"}}
                   onClick={() => setOpenSlot(s)}>
                <div className="period">
                  <span className="p-num">{s.period}</span>
                </div>
                <div className="subject">
                  {s.subject}
                  <div className="sub2">NEIS: {s.neisLabel} · {s.room} · {s.time}</div>
                </div>
                <div className="klass">{s.grade}</div>
                <div className="klass">{s.classNo}</div>
                <div>
                  {s.checked
                    ? <>
                        <Chip kind="ok"><Icon name="check" size={11}/> 완료 · 표시 {s.absences}</Chip>
                        {s.checkedAt && <div className="sub2">{formatSavedAt(s.checkedAt)}</div>}
                      </>
                    : <Chip kind="gray">체크 대기</Chip>}
                </div>
                <div className="status-stack">
                  {s.checked && <Chip kind="ok"><Icon name="check" size={11}/> Drive 저장 완료</Chip>}
                  <StatusChip item={s}/>
                </div>
                <div className="chev"><Icon name="chev-r" size={16}/></div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {openSlot && (
        <ClassSheet
          slot={openSlot}
          rosters={rosters}
          onClose={() => setOpenSlot(null)}
          currentMarks={marksById[openSlot.id] || openSlot.marks || {}}
          onSaveMarks={onSaveMarks}
          appendLog={appendLog}
        />
      )}
    </>
  );
};

