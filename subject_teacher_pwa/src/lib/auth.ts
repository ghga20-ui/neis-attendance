// Google Identity Services (GIS) token-model auth for the PWA.
//
// Design constraints (see specs/2026-04-17-subject-teacher-design.md §5):
// - Scope is `drive.appdata` only.
// - Access tokens live in memory only. Never persist them to localStorage.
// - Silent refresh keeps the teacher signed in without repeated popups.

const GIS_SRC = "https://accounts.google.com/gsi/client";
export const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  callback: (response: TokenResponse) => void;
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

// Minimal shape of the slice of GIS we use. Loaded at runtime from GIS_SRC.
interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
  }) => TokenClient;
  revoke: (token: string, done?: () => void) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

let scriptPromise: Promise<void> | null = null;
let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;

/** True when a web client ID is configured. */
export function isConfigured(): boolean {
  return typeof CLIENT_ID === "string" && CLIENT_ID.length > 0;
}

function loadGisScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity Services 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Load GIS and create the token client. Safe to call more than once. */
export async function initAuth(): Promise<void> {
  if (!isConfigured()) {
    throw new Error("VITE_GOOGLE_CLIENT_ID 가 설정되지 않았습니다. .env.local 을 확인하세요.");
  }
  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error("Google Identity Services 초기화에 실패했습니다.");
  }
  if (!tokenClient) {
    tokenClient = oauth2.initTokenClient({
      client_id: CLIENT_ID as string,
      scope: DRIVE_APPDATA_SCOPE,
      callback: () => {
        // Replaced per-request inside requestAccessToken().
      },
    });
  }
}

/**
 * Request an access token. With `silent: true` GIS attempts a no-UI refresh;
 * for the first sign-in pass `silent: false` to show the consent prompt.
 */
export function requestAccessToken({ silent }: { silent: boolean }): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error("auth가 초기화되지 않았습니다. initAuth()를 먼저 호출하세요."));
      return;
    }
    tokenClient.callback = (response) => {
      if (response.error || !response.access_token) {
        reject(new Error(response.error_description || response.error || "토큰 발급에 실패했습니다."));
        return;
      }
      accessToken = response.access_token;
      tokenExpiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: silent ? "" : "consent" });
  });
}

/** Returns a non-expired access token, silently refreshing if needed. */
export async function getValidAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) {
    return accessToken;
  }
  return requestAccessToken({ silent: true });
}

/** Current cached token without triggering a refresh (may be null/expired). */
export function getCachedToken(): string | null {
  return accessToken;
}

/** Revoke the current token and clear local state ("연결 해제"). */
export function revoke(): Promise<void> {
  return new Promise((resolve) => {
    const oauth2 = window.google?.accounts?.oauth2;
    const token = accessToken;
    accessToken = null;
    tokenExpiresAt = 0;
    if (token && oauth2) {
      oauth2.revoke(token, () => resolve());
    } else {
      resolve();
    }
  });
}
