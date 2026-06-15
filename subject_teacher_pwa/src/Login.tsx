interface LoginProps {
  onSignIn: () => void;
  busy?: boolean;
  error?: string;
  /** Set when VITE_GOOGLE_CLIENT_ID is missing — sign-in cannot proceed. */
  notConfigured?: boolean;
}

export default function Login({ onSignIn, busy, error, notConfigured }: LoginProps) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark" aria-hidden="true">출</div>
        <h1>나이스 교과 출결</h1>
        <p className="login-sub">수업 직후 모바일에서 출결을 체크하고 Google Drive에 바로 저장합니다.</p>

        {notConfigured ? (
          <p className="login-error">
            구글 클라이언트 ID가 설정되지 않았습니다. <code>.env.local</code>에
            <code>VITE_GOOGLE_CLIENT_ID</code>를 추가한 뒤 다시 실행하세요.
          </p>
        ) : (
          <>
            <button className="login-btn" type="button" onClick={onSignIn} disabled={busy}>
              {busy ? "연결 중…" : "Google 계정으로 로그인"}
            </button>
            {error && <p className="login-error">{error}</p>}
            <p className="login-note">
              Drive 숨김 폴더(appDataFolder) 1개 권한만 사용합니다. 학생 정보는 교사 본인
              계정에만 저장되며 외부 서버로 전송되지 않습니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
