import { useEffect, useState } from "react";
import App from "./App";
import Login from "./Login";
import { initAuth, isConfigured, requestAccessToken, revoke } from "./lib/auth";
import {
  loadAll,
  loadMonthlyAttendance,
  saveSlotAttendance,
  type LoadedDriveData,
} from "./lib/driveData";
import type { StudentEntry, TimetableSlot } from "./lib/schemas";

type Phase = "init" | "signedOut" | "loading" | "ready" | "error";

function toLocalIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toAttendanceByDate(data: LoadedDriveData) {
  return data.attendance?.records ?? {};
}

function toRosters(data: LoadedDriveData): Record<string, StudentEntry[]> {
  return data.students?.classes ?? {};
}

function toSlots(data: LoadedDriveData): TimetableSlot[] {
  return data.timetable?.slots ?? [];
}

export default function Root() {
  const [phase, setPhase] = useState<Phase>("init");
  const [error, setError] = useState("");
  const [data, setData] = useState<LoadedDriveData | null>(null);
  const today = toLocalIsoDate();

  useEffect(() => {
    if (!isConfigured()) {
      setPhase("error");
      setError("VITE_GOOGLE_CLIENT_ID 가 설정되지 않았습니다.");
      return;
    }
    let cancelled = false;
    // Try a silent sign-in first so a returning teacher (active Google session)
    // lands straight in the app without tapping the login button every visit.
    initAuth()
      .then(() => Promise.race([
        requestAccessToken({ silent: true }),
        // Never let a hung silent attempt keep us on the splash forever.
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("silent-timeout")), 3500)),
      ]))
      .then(async () => {
        const loaded = await loadAll(today.slice(0, 7));
        if (!cancelled) {
          setData(loaded);
          setPhase("ready");
        }
      })
      .catch(() => {
        // No active session / consent yet → show the landing + login screen.
        if (!cancelled) setPhase("signedOut");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async () => {
    setError("");
    setPhase("loading");
    try {
      await requestAccessToken({ silent: false });
      const loaded = await loadAll(today.slice(0, 7));
      setData(loaded);
      setPhase("ready");
    } catch (cause) {
      setPhase("signedOut");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const signOut = async () => {
    try {
      await revoke();
    } catch {
      // ignore — clearing local state below is what matters
    }
    setData(null);
    setError("");
    setPhase("signedOut");
  };

  if (phase === "init") {
    return (
      <div className="splash">
        <div className="splash-mark" aria-hidden="true">✓</div>
        <p>불러오는 중…</p>
      </div>
    );
  }

  if (phase === "error") {
    return <Login onSignIn={signIn} notConfigured={!isConfigured()} error={error} />;
  }

  if (phase === "ready" && data) {
    return (
      <App
        initialDate={today}
        slots={toSlots(data)}
        rosters={toRosters(data)}
        initialAttendance={toAttendanceByDate(data)}
        initialMonth={today.slice(0, 7)}
        onSaveSlot={(date, slotId, payload) =>
          saveSlotAttendance(date.slice(0, 7), date, slotId, payload)
        }
        onLoadMonth={async (month) => (await loadMonthlyAttendance(month))?.records ?? {}}
        onSignOut={signOut}
      />
    );
  }

  return <Login onSignIn={signIn} busy={phase === "loading"} error={error} />;
}
