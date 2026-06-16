// @ts-nocheck -- verbatim JS->TSX port; incremental typing is a follow-up
import React from "react";
import { Icon } from "./components";
const { useEffect, useRef } = React;

export const LogDock = ({ lines, collapsed, setCollapsed, clear }) => {
  const bodyRef = useRef<any>(null);
  useEffect(() => {
    if (bodyRef.current && !collapsed) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines, collapsed]);

  return (
    <div className="log-dock" data-collapsed={collapsed ? "true" : "false"}>
      <div className="log-head" onClick={() => setCollapsed(!collapsed)}>
        <span className="dot"/>
        실행 로그
        <span className="meta">· {lines.length} lines</span>
        <span className="sp"/>
        <button className="action" onClick={e => { e.stopPropagation(); clear(); }}>지우기</button>
        <button className="action" onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(lines.map(l=>`[${l.ts}] [${l.lv}] ${l.msg}`).join("\n")); }}>복사</button>
        <span className="chev"><Icon name="chev-d" size={14}/></span>
      </div>
      <div className="log-body" ref={bodyRef}>
        {lines.map((l, i) => (
          <div className="line" key={i}>
            <span className="ts">{l.ts}</span>
            <span className={`lv ${l.lv}`}>{l.lv}</span>
            <span className="msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

