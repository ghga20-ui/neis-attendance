import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyMarks,
  cycleMark,
  marksToSlotAttendance,
  type MarksByStudent,
  type StudentMark,
} from "./lib/attendance";
import { loadQueue, persistQueue } from "./lib/db";
import {
  computeLessonDisplayStatus,
  getLessonsForDate,
  selectedDateLabel,
} from "./lib/lessonStatus";
import {
  enqueueSave,
  failedItems,
  markStatusByTarget,
  pendingItems,
  type SaveQueueItem,
} from "./lib/offlineQueue";
import { buildUncheckedReminderMessage, deriveDriveSyncLabel } from "./lib/syncAndReminder";
import type { SlotAttendance, StudentEntry, TimetableSlot } from "./lib/schemas";
import { sampleRosters, sampleSlots } from "./sampleData";

type AttendanceByDate = Record<string, Record<string, SlotAttendance>>;
type RostersByClass = Record<string, StudentEntry[]>;

/** Persists one slot's attendance (e.g. to Drive). Resolves on success. */
export type SaveSlotHandler = (
  date: string,
  slotId: string,
  payload: SlotAttendance,
) => Promise<void>;

interface AppProps {
  initialDate?: string;
  /** Timetable slots. Defaults to bundled sample data for tests/offline demo. */
  slots?: TimetableSlot[];
  /** Rosters keyed by `grade-classNo`. Defaults to sample data. */
  rosters?: RostersByClass;
  /** Attendance already on Drive, keyed by date then slot id. */
  initialAttendance?: AttendanceByDate;
  /** Month (YYYY-MM) already in initialAttendance, so it is not refetched. */
  initialMonth?: string;
  /** Called after each local save to persist to Drive. Omit for demo mode. */
  onSaveSlot?: SaveSlotHandler;
  /** Loads another month's attendance when the user navigates across months. */
  onLoadMonth?: (month: string) => Promise<AttendanceByDate>;
}

function toLocalIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function classKey(slot: TimetableSlot): string {
  return `${slot.grade}-${slot.classNo}`;
}

function dateAtLocalMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

function addDays(isoDate: string, days: number): string {
  const date = dateAtLocalMidnight(isoDate);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function markLabel(mark: StudentMark): string {
  if (mark === "absent") return "/";
  if (mark === "excused") return "인정";
  return "출석";
}

function exceptionSummaryFromMarks(marks: MarksByStudent): string {
  const parts = Object.entries(marks)
    .filter(([, mark]) => mark !== "present")
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([number, mark]) => `${number}번 ${mark === "excused" ? "출석인정" : "결과"}`);
  return parts.length ? parts.join(", ") : "저장하면 전원 출석";
}

function formatSavedAt(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "마지막 저장 알 수 없음";
  return `마지막 저장 ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

const PRIVACY_ACK_KEY = "privacyNoticeAck";

export default function App({
  initialDate = toLocalIsoDate(),
  slots = sampleSlots,
  rosters = sampleRosters,
  initialAttendance,
  initialMonth,
  onSaveSlot,
  onLoadMonth,
}: AppProps = {}) {
  const [page, setPage] = useState<"lessons" | "sync" | "settings">("lessons");
  const [privacyAcked, setPrivacyAcked] = useState<boolean>(
    () => localStorage.getItem(PRIVACY_ACK_KEY) === "1",
  );
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [dateInputValue, setDateInputValue] = useState(initialDate);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [attendanceByDate, setAttendanceByDate] = useState<AttendanceByDate>(initialAttendance ?? {});
  const [drafts, setDrafts] = useState<Record<string, MarksByStudent>>({});
  const [queue, setQueue] = useState<SaveQueueItem[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(
    () => (typeof navigator === "undefined" ? true : navigator.onLine),
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  const visibleSlots = getLessonsForDate(slots, selectedDate);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null;
  const selectedRoster = selectedSlot ? rosters[classKey(selectedSlot)] ?? [] : [];
  const selectedDraftKey = selectedSlot ? `${selectedDate}:${selectedSlot.id}` : "";
  const selectedDraft = selectedSlot
    ? drafts[selectedDraftKey] ?? createEmptyMarks(selectedRoster)
    : {};
  const draftSummary = selectedSlot ? exceptionSummaryFromMarks(selectedDraft) : "";
  const attendanceForDate = attendanceByDate[selectedDate] ?? {};

  const counts = useMemo(() => {
    const visibleSlotIds = new Set(visibleSlots.map((slot) => slot.id));
    const checked = Object.keys(attendanceForDate).filter((slotId) => visibleSlotIds.has(slotId)).length;
    const pending = pendingItems(queue).length;
    const failed = failedItems(queue).length;
    const unchecked = Math.max(visibleSlots.length - checked, 0);
    return { checked, failed, pending, unchecked };
  }, [attendanceForDate, queue, visibleSlots]);
  const driveSyncLabel = deriveDriveSyncLabel({ isOnline, queue });

  const openLesson = (slot: TimetableSlot) => {
    const roster = rosters[classKey(slot)] ?? [];
    const draftKey = `${selectedDate}:${slot.id}`;
    setDrafts((current) => ({
      ...current,
      [draftKey]: current[draftKey] ?? createEmptyMarks(roster),
    }));
    setSelectedSlotId(slot.id);
  };

  const toggleStudent = (studentNumber: number) => {
    if (!selectedSlot) return;
    setDrafts((current) => {
      const draft = current[selectedDraftKey] ?? createEmptyMarks(selectedRoster);
      return {
        ...current,
        [selectedDraftKey]: {
          ...draft,
          [studentNumber]: cycleMark(draft[studentNumber] ?? "present"),
        },
      };
    });
  };

  // Mirror the latest queue so flush callbacks read fresh data without being
  // re-created (and re-triggering effects) on every queue change.
  const queueRef = useRef(queue);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  const hydratedRef = useRef(false);
  const flushingRef = useRef(false);

  // Upload one enqueued save to Drive and resolve its queue status. Identified
  // by date+slot rather than id because enqueueSave dedupes pending items.
  const flushSave = async (date: string, slotId: string, payload: SlotAttendance) => {
    if (!onSaveSlot) return;
    try {
      await onSaveSlot(date, slotId, payload);
      setQueue((current) => markStatusByTarget(current, date, slotId, "synced"));
    } catch {
      setQueue((current) => markStatusByTarget(current, date, slotId, "failed"));
    }
  };

  // Re-upload every not-yet-synced item. Used on startup, on reconnect, and by
  // the manual retry button. Guarded so overlapping triggers don't double-run;
  // saves are idempotent so a rare duplicate upload is harmless.
  const flushAll = useCallback(async () => {
    if (!onSaveSlot || flushingRef.current) return;
    flushingRef.current = true;
    try {
      for (const item of queueRef.current.filter((entry) => entry.status !== "synced")) {
        try {
          await onSaveSlot(item.date, item.slotId, item.payload);
          setQueue((current) => markStatusByTarget(current, item.date, item.slotId, "synced"));
        } catch {
          setQueue((current) => markStatusByTarget(current, item.date, item.slotId, "failed"));
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [onSaveSlot]);

  const flushAllRef = useRef(flushAll);
  useEffect(() => {
    flushAllRef.current = flushAll;
  }, [flushAll]);

  // Restore the persisted queue on startup, overlay its payloads onto the view,
  // then retry anything left unsynced from a previous session.
  useEffect(() => {
    let cancelled = false;
    loadQueue()
      .then((items) => {
        if (cancelled) return;
        if (items.length) {
          setQueue(items);
          setAttendanceByDate((current) => {
            const next = { ...current };
            for (const item of items) {
              next[item.date] = { ...(next[item.date] ?? {}), [item.slotId]: item.payload };
            }
            return next;
          });
        }
        hydratedRef.current = true;
        void flushAllRef.current();
      })
      .catch(() => {
        hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the queue after every change (once hydration has run, so the empty
  // initial state never clobbers a stored queue).
  useEffect(() => {
    if (!hydratedRef.current) return;
    void persistQueue(queue);
  }, [queue]);

  // Track connectivity for the offline banner, and auto-retry uploads when the
  // device comes back online.
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      void flushAllRef.current();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Drive splits attendance into monthly files; we preload only the current
  // month. When the teacher navigates to a date in another month, fetch that
  // month and merge it in (local entries win so an in-flight save isn't lost).
  const loadedMonthsRef = useRef(new Set<string>(initialMonth ? [initialMonth] : []));
  useEffect(() => {
    if (!onLoadMonth) return;
    const month = selectedDate.slice(0, 7);
    if (loadedMonthsRef.current.has(month)) return;
    loadedMonthsRef.current.add(month);
    onLoadMonth(month)
      .then((records) => {
        setAttendanceByDate((current) => {
          const next = { ...current };
          for (const [date, slots] of Object.entries(records)) {
            next[date] = { ...slots, ...(next[date] ?? {}) };
          }
          return next;
        });
      })
      .catch(() => {
        loadedMonthsRef.current.delete(month);
      });
  }, [selectedDate, onLoadMonth]);

  const saveLesson = () => {
    if (!selectedSlot) return;
    const date = selectedDate;
    const slotId = selectedSlot.id;
    const saved = marksToSlotAttendance(selectedDraft, new Date().toISOString());
    setAttendanceByDate((current) => ({
      ...current,
      [date]: {
        ...(current[date] ?? {}),
        [slotId]: saved,
      },
    }));
    setQueue((current) => enqueueSave(current, { date, slotId, payload: saved }));
    setSelectedSlotId(null);
    showToast(isOnline ? "저장됐어요" : "기기에 저장됨 · 연결되면 자동 반영");
    void flushSave(date, slotId, saved);
  };

  const retryFailed = () => {
    void flushAll();
  };

  const ackPrivacy = () => {
    localStorage.setItem(PRIVACY_ACK_KEY, "1");
    setPrivacyAcked(true);
  };

  return (
    <div className="mobile-app">
      {!privacyAcked && (
        <div className="privacy-banner" role="alert">
          <span>이 앱은 학생 학번·출결만 처리합니다. 학생 이름은 외부로 전송·저장되지 않습니다.</span>
          <button type="button" className="privacy-banner-btn" onClick={ackPrivacy}>확인</button>
        </div>
      )}
      <header className="top">
        <div>
          <p className="muted">교과 출결</p>
          <h1>{selectedDate === initialDate ? "오늘 수업" : "선택 날짜"}</h1>
        </div>
        <div className="sync-pill" aria-label={`동기화 대기 ${counts.pending}건`}>
          동기화 대기 {counts.pending}건
        </div>
      </header>

      <button
        className="date-card"
        type="button"
        aria-label="날짜 선택"
        onClick={() => {
          setDateInputValue(selectedDate);
          setDateSheetOpen(true);
        }}
      >
        <div>
          <strong>{selectedDateLabel(selectedDate)}</strong>
          <span>{onSaveSlot ? "Google Drive 연동 · 모바일 입력" : "샘플 데이터 · 데모"}</span>
        </div>
        <div className="ring">{counts.checked}/{visibleSlots.length}</div>
      </button>

      {!isOnline && (
        <div className="status-banner offline" role="status">
          인터넷에 연결되어 있지 않아요. 저장은 기기에 보관되고, 연결되면 자동으로 반영됩니다.
        </div>
      )}
      {onSaveSlot && counts.failed > 0 && (
        <div className="status-banner failed" role="alert">
          <span>저장 실패 {counts.failed}건이 있어요.</span>
          <button type="button" onClick={retryFailed}>다시 시도</button>
        </div>
      )}

      {page === "lessons" && (
        <main className="lesson-list">
          {visibleSlots.length === 0 && (
            <div className="empty-card">선택한 날짜에 표시할 수업이 없습니다.</div>
          )}
          {visibleSlots.map((slot) => {
            const saved = attendanceForDate[slot.id];
            const summary = computeLessonDisplayStatus(saved);
            const queued = queue.find((item) => item.date === selectedDate && item.slotId === slot.id);
            const driveStatus = queued?.status === "failed"
              ? { className: "failed", label: "Drive 실패" }
              : queued?.status === "pending"
                ? { className: "pending", label: "Drive 대기" }
                : { className: "synced", label: "Drive 완료" };
            const neisLabel = saved?.syncedToNeis
              ? (saved.closedOnNeis ? "NEIS 마감" : "NEIS 반영")
              : "NEIS 미반영";
            return (
              <button
                className={`lesson-card ${summary.checked ? "checked" : ""}`}
                key={slot.id}
                type="button"
                onClick={() => openLesson(slot)}
                aria-label={`${slot.grade}-${slot.classNo} ${slot.subjectName} ${slot.period}교시 열기`}
              >
                <span className="period">{slot.period}교시</span>
                <span className="lesson-main">
                  <strong>{slot.grade}-{slot.classNo} {slot.subjectName}</strong>
                  <small>{summary.compactLabel}</small>
                  {saved && <small className="saved-at">{formatSavedAt(saved.checkedAt)}</small>}
                  {saved && (
                    <span className="meta-row">
                      <span className={`mini-status ${driveStatus.className}`}>{driveStatus.label}</span>
                      <span className="mini-status">{neisLabel}</span>
                    </span>
                  )}
                </span>
                <span className={summary.checked ? "status done" : "status"}>{summary.checked ? "완료" : "입력"}</span>
              </button>
            );
          })}
        </main>
      )}

      {page === "sync" && (
        <main className="stack-page">
          <h2>동기화</h2>
          <section className="info-card">
            <strong>Drive 상태</strong>
            <p>오프라인 저장 후 연결되면 자동 재동기화합니다.</p>
            <div className="status-grid">
              <span>{driveSyncLabel} {counts.pending}건</span>
              <span>완료 {queue.filter((item) => item.status === "synced").length}건</span>
              <span>실패 {counts.failed}건</span>
            </div>
            {onSaveSlot && counts.failed > 0 && (
              <button className="secondary" type="button" onClick={retryFailed}>
                실패한 {counts.failed}건 다시 시도
              </button>
            )}
          </section>
          <section className="info-card">
            <strong>17:00 미체크 알림</strong>
            <p>일정 시각 이후 미체크 수업이 남아 있으면 알림을 보냅니다.</p>
            <p>{buildUncheckedReminderMessage(counts.unchecked)}</p>
          </section>
          <section className="info-card">
            <strong>NEIS 반영</strong>
            <p>NEIS 반영 여부는 PC 실행 결과를 읽기 전용으로 표시합니다.</p>
          </section>
        </main>
      )}

      {page === "settings" && (
        <main className="stack-page">
          <h2>설정 확인</h2>
          <p className="page-note">시간표와 학생 명부는 데스크톱에서 편집합니다.</p>
          <section className="info-card">
            <strong>시간표</strong>
            {slots.map((slot) => (
              <p key={slot.id}>{slot.period}교시 · {slot.grade}-{slot.classNo} {slot.subjectName}</p>
            ))}
          </section>
          <section className="info-card">
            <strong>학생 명부</strong>
            {Object.entries(rosters).map(([key, roster]) => (
              <p key={key}>{key} · {roster.length}명</p>
            ))}
          </section>
        </main>
      )}

      <nav className="bottom-nav" aria-label="모바일 메뉴">
        <button className={page === "lessons" ? "on" : ""} type="button" onClick={() => setPage("lessons")}>수업</button>
        <button className={page === "sync" ? "on" : ""} type="button" onClick={() => setPage("sync")}>동기화</button>
        <button className={page === "settings" ? "on" : ""} type="button" onClick={() => setPage("settings")}>설정</button>
      </nav>

      {dateSheetOpen && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="날짜 선택">
          <div className="sheet-panel compact-sheet">
            <div className="grabber" />
            <div className="sheet-head">
              <div>
                <p className="muted">수업 날짜</p>
                <h2>날짜 선택</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setDateSheetOpen(false)} aria-label="닫기">×</button>
            </div>
            <div className="quick-dates">
              <button type="button" onClick={() => { const nextDate = addDays(initialDate, -1); setSelectedDate(nextDate); setDateInputValue(nextDate); setDateSheetOpen(false); }}>어제</button>
              <button type="button" onClick={() => { setSelectedDate(initialDate); setDateInputValue(initialDate); setDateSheetOpen(false); }}>오늘</button>
              <button type="button" onClick={() => { const nextDate = addDays(initialDate, 1); setSelectedDate(nextDate); setDateInputValue(nextDate); setDateSheetOpen(false); }}>내일</button>
            </div>
            <input
              className="date-input"
              type="date"
              aria-label="직접 날짜 선택"
              value={dateInputValue}
              onChange={(event) => {
                const nextDate = event.target.value;
                setDateInputValue(nextDate);
                if (/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
                  setSelectedDate(nextDate);
                }
              }}
            />
          </div>
        </div>
      )}

      <footer className="privacy-footer">
        <details>
          <summary>개인정보 처리방침 요약</summary>
          <p>이 앱은 학생 학번과 출결 정보만 Google Drive에 저장합니다. 학생 이름은 이 기기에만 저장되며 외부 서버로 전송되지 않습니다. 출결 데이터는 담당 교사의 Google Drive에만 기록됩니다. 자세한 내용은 배포 패키지의 <code>docs/legal/privacy-policy.md</code>를 확인하세요.</p>
        </details>
      </footer>

      {selectedSlot && (
        <div
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedSlot.grade}-${selectedSlot.classNo} ${selectedSlot.subjectName} 출결 입력`}
        >
          <div className="sheet-panel">
            <div className="grabber" />
            <div className="sheet-head">
              <div>
                <p className="muted">{selectedSlot.period}교시 · {classKey(selectedSlot)}</p>
                <h2>{selectedSlot.grade}-{selectedSlot.classNo} {selectedSlot.subjectName}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setSelectedSlotId(null)} aria-label="닫기">×</button>
            </div>

            <div className="legend">
              <span><i className="dot present" />출석</span>
              <span><i className="dot absent" />결과 /</span>
              <span><i className="dot excused" />출석인정</span>
            </div>

            <div className="students">
              {selectedRoster.map((student) => {
                const mark = selectedDraft[student.number] ?? "present";
                return (
                  <button
                    key={student.number}
                    className="student-row"
                    data-mark={mark}
                    type="button"
                    aria-pressed={mark !== "present"}
                    aria-label={`${student.number}번 ${markLabel(mark)}`}
                    onClick={() => toggleStudent(student.number)}
                  >
                    <span>{student.number}번</span>
                    <em>{markLabel(mark)}</em>
                  </button>
                );
              })}
            </div>

            <div className="draft-summary">
              <strong>저장 전 요약</strong>
              <span>{draftSummary}</span>
            </div>

            <div className="sheet-actions">
              <button className="secondary" type="button" onClick={() => setSelectedSlotId(null)}>취소</button>
              <button className="primary" type="button" onClick={saveLesson}>저장</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
