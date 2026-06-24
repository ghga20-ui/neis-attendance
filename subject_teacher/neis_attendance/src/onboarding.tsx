import React from "react";
import { Icon } from "./components";

/** First-run setup guide. Steps mark themselves done from real app state and
 *  jump to the matching tab. Re-openable from the sidebar ("시작 가이드"). */
export const OnboardingGuide = ({ steps, onGo, onClose }) => {
  const doneCount = steps.filter(s => s.done).length;
  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="시작 가이드">
      <div className="ob-card">
        <div className="ob-head">
          <div className="ob-logo"><Icon name="check" size={20}/></div>
          <div className="ob-head-text">
            <h2>체크온 시작하기</h2>
            <div className="ob-sub">아래 순서로 준비하면 수업 출결이 자동으로 정리됩니다. ({doneCount}/{steps.length} 완료)</div>
          </div>
          <button className="ob-x" onClick={onClose} aria-label="닫기"><Icon name="x" size={18}/></button>
        </div>

        <div className="ob-steps">
          {steps.map((s, i) => (
            <button key={s.key} className={`ob-step ${s.done ? "done" : ""}`} onClick={() => onGo(s.key)}>
              <span className="ob-num">{s.done ? <Icon name="check" size={14}/> : i + 1}</span>
              <span className="ob-step-main">
                <strong>{s.title}</strong>
                <small>{s.desc}</small>
              </span>
              <span className="ob-go"><Icon name="chev-r" size={16}/></span>
            </button>
          ))}
        </div>

        <div className="ob-note">
          <strong>NEIS Open API 키가 필요해요</strong>
          <p>‘NEIS 실시간 조회’로 시간표를 가져오려면 무료 인증키가 필요합니다.
            <b> open.neis.go.kr</b> 접속 → 회원가입·로그인 → ‘인증키 신청’ → 발급된 키를
            ‘시간표’ 화면의 <b>NEIS Open API 키</b> 칸에 붙여넣고 저장하세요.</p>
        </div>

        <div className="ob-actions">
          <button className="tb-btn primary" onClick={onClose}>시작하기</button>
        </div>
      </div>
    </div>
  );
};
