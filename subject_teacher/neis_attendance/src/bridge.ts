import { createMockApi } from "./mock-api";

export interface DesktopApi {
  get_settings(): Promise<string>;
  save_settings(json: string): Promise<string>;
  get_timetable_tsv(): Promise<string>;
  save_timetable_tsv(tsv: string, effectiveFrom: string): Promise<string>;
  get_students_tsv(): Promise<string>;
  save_students_tsv(tsv: string): Promise<string>;
  get_today_slots(dateStr: string): Promise<string>;
  save_slot_attendance(dateStr: string, slotId: string, marksJson: string): Promise<string>;
  get_drive_user(): Promise<string>;
  get_neis_api_key(): Promise<string>;
  save_neis_api_key(apiKey: string): Promise<string>;
  get_password(): Promise<string>;
  import_students_file(classKey: string): Promise<string>;
  preview_neis_public_timetable(payloadJson: string): Promise<string>;
  publish_neis_timetable_for_week(dateStr: string): Promise<string>;
  find_neis_subject_candidates(payloadJson: string): Promise<string>;
  start_run(dateStr: string, password: string, closeAfter: boolean): Promise<string>;
}

declare global {
  interface Window {
    pywebview?: { api: DesktopApi };
    __logCallbacks: Array<(entry: unknown) => void>;
    __progressCallbacks: Array<(progress: unknown) => void>;
    __pywebviewReadyCallbacks: Array<() => void>;
    __pushLog: (entry: unknown) => void;
    __pushProgress: (progress: unknown) => void;
    __registerBridge: (onLog: (entry: unknown) => void, onProgress: (progress: unknown) => void) => void;
    __isPywebview: () => boolean;
    __onPywebviewReady: (callback: () => void) => void;
  }
}

window.__logCallbacks = [];
window.__progressCallbacks = [];
window.__pywebviewReadyCallbacks = [];

window.__pushLog = (entry) => {
  window.__logCallbacks.forEach((callback) => callback(entry));
};

window.__pushProgress = (progress) => {
  window.__progressCallbacks.forEach((callback) => callback(progress));
};

window.__registerBridge = (onLog, onProgress) => {
  window.__logCallbacks.push(onLog);
  window.__progressCallbacks.push(onProgress);
};

window.__isPywebview = () => typeof window.pywebview !== "undefined";

window.__onPywebviewReady = (callback) => {
  if (window.__isPywebview()) {
    callback();
    return;
  }
  window.__pywebviewReadyCallbacks.push(callback);
};

window.addEventListener("pywebviewready", () => {
  window.__pywebviewReadyCallbacks.splice(0).forEach((callback) => callback());
});

let mock: DesktopApi | null = null;

export function getApi(): Promise<DesktopApi> {
  const readyApi = window.pywebview?.api;
  if (readyApi) return Promise.resolve(readyApi);

  return new Promise((resolve) => {
    let settled = false;
    const useReal = () => {
      if (settled) return;
      const api = window.pywebview?.api;
      if (!api) return;
      settled = true;
      resolve(api);
    };

    window.__onPywebviewReady(useReal);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      mock = mock ?? createMockApi();
      resolve(mock);
    }, 300);
  });
}
