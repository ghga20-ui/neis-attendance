import React from "react";
const { useState } = React;

/* ---------- Icons (20x20 viewBox unless noted) ---------- */
export const Icon = ({ name, size = 18, stroke = 1.6 }) => {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" } as React.SVGProps<SVGSVGElement>;
  switch (name) {
    case "bolt":     return <svg {...common}><path d="M11.5 2L4.5 11.2h4L8 18l7-9.4h-4L11.5 2z"/></svg>;
    case "gear":     return <svg {...common}><circle cx="10" cy="10" r="2.2"/><path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>;
    case "board":    return <svg {...common}><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M2.5 8H17.5M7 3.5v13"/></svg>;
    case "users":    return <svg {...common}><circle cx="8" cy="7.5" r="2.6"/><path d="M3.5 16.2c.5-2.6 2.4-3.9 4.5-3.9s4 1.3 4.5 3.9"/><circle cx="14.2" cy="7" r="1.9"/><path d="M13 12.5c2.5 0 3.8 1.5 4.2 3.5"/></svg>;
    case "cloud":    return <svg {...common}><path d="M5.6 14.5a3.3 3.3 0 01-.2-6.5 4.5 4.5 0 018.8-.4 3 3 0 01.8 5.9"/><path d="M5 14.5h9.5"/></svg>;
    case "key":      return <svg {...common}><circle cx="7" cy="10" r="3"/><path d="M10 10h7.5M15 10v2.5M13 10v2"/></svg>;
    case "lock":     return <svg {...common}><rect x="4.5" y="9" width="11" height="8" rx="1.8"/><path d="M7 9V6.5a3 3 0 016 0V9"/></svg>;
    case "list":     return <svg {...common}><path d="M7 5.5h10M7 10h10M7 14.5h10"/><circle cx="4" cy="5.5" r=".8" fill="currentColor"/><circle cx="4" cy="10" r=".8" fill="currentColor"/><circle cx="4" cy="14.5" r=".8" fill="currentColor"/></svg>;
    case "calendar": return <svg {...common}><rect x="3" y="4.5" width="14" height="12" rx="2"/><path d="M3 8.5h14M7 3v3M13 3v3"/></svg>;
    case "info":     return <svg {...common}><circle cx="10" cy="10" r="7.5"/><path d="M10 9v4.5"/><circle cx="10" cy="6.6" r=".7" fill="currentColor"/></svg>;
    case "check":    return <svg {...common}><path d="M4 10.5l4 4 8-9"/></svg>;
    case "x":        return <svg {...common}><path d="M5 5l10 10M15 5L5 15"/></svg>;
    case "plus":     return <svg {...common}><path d="M10 4v12M4 10h12"/></svg>;
    case "trash":    return <svg {...common}><path d="M4.5 6.5h11M8.5 6V4.5h3V6M6 6.5l.7 10.3c0 .7.5 1.2 1.2 1.2h4.2c.7 0 1.2-.5 1.2-1.2L14 6.5"/></svg>;
    case "refresh":  return <svg {...common}><path d="M16 10a6 6 0 01-10.3 4.2M4 10a6 6 0 0110.3-4.2"/><path d="M14.3 2.8v3h-3M5.7 17.2v-3h3"/></svg>;
    case "play":     return <svg {...common}><path d="M6 4.5v11l9-5.5z" fill="currentColor" stroke="none"/></svg>;
    case "clock":    return <svg {...common}><circle cx="10" cy="10" r="7.5"/><path d="M10 5.5V10l3 2"/></svg>;
    case "chev-r":   return <svg {...common}><path d="M8 5l5 5-5 5"/></svg>;
    case "chev-d":   return <svg {...common}><path d="M5 8l5 5 5-5"/></svg>;
    case "chev-l":   return <svg {...common}><path d="M12 5l-5 5 5 5"/></svg>;
    case "paste":    return <svg {...common}><rect x="6" y="3" width="8" height="3" rx="1"/><path d="M6 4.5H4.5A1.5 1.5 0 003 6v10.5A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H14"/></svg>;
    case "upload":   return <svg {...common}><path d="M10 13V4M6.5 7.5L10 4l3.5 3.5"/><path d="M4 13.5v2A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5v-2"/></svg>;
    case "search":   return <svg {...common}><circle cx="9" cy="9" r="5"/><path d="M13 13l3 3"/></svg>;
    case "sliders":  return <svg {...common}><path d="M3 6h14M3 14h14"/><circle cx="7" cy="6" r="1.8" fill="white"/><circle cx="13" cy="14" r="1.8" fill="white"/></svg>;
    case "school":   return <svg {...common}><path d="M10 3L2.5 6.5 10 10l7.5-3.5L10 3zM5 8.5V13c0 1.7 2.3 3 5 3s5-1.3 5-3V8.5"/></svg>;
    case "bell":     return <svg {...common}><path d="M5.5 14.5h9l-1-1.5V9a3.5 3.5 0 10-7 0v4l-1 1.5z"/><path d="M8.5 16.5a1.5 1.5 0 003 0"/></svg>;
    case "book":     return <svg {...common}><path d="M3.5 4.5h5a2 2 0 012 2v10a2 2 0 00-2-2h-5v-10zM16.5 4.5h-5a2 2 0 00-2 2v10a2 2 0 012-2h5v-10z"/></svg>;
    default: return <svg {...common}><circle cx="10" cy="10" r="3"/></svg>;
  }
};

/* ---------- Small UI primitives ---------- */
export const Chip = ({ kind = "gray", children, dot = true }) => (
  <span className={`chip chip-${kind}`}>{dot && <span className="chip-dot"/>}{children}</span>
);

export const StatusChip = ({ item }) => {
  if (item.error) return <Chip kind="bad"><Icon name="x" size={11}/> 오류 · {item.error}</Chip>;
  if (item.synced) return <Chip kind="ok"><Icon name="check" size={11}/> NEIS 반영됨</Chip>;
  if (item.running) return <Chip kind="info"><Icon name="clock" size={11}/> 반영 중…</Chip>;
  return <Chip kind="gray">미반영</Chip>;
};

export const Checkbox = ({ checked, onChange, label }: any) => (
  <label className="cbx">
    <span className={`cbx-box ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      {checked && <Icon name="check" size={12} stroke={2.4}/>}
    </span>
    {label && <span>{label}</span>}
  </label>
);

export const Ring = ({ pct = 0, size = 44 }) => {
  const r = size/2 - 3, c = 2*Math.PI*r;
  return (
    <svg width={size} height={size} className="ring">
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--sep)" strokeWidth="3" fill="none"/>
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--accent)" strokeWidth="3" fill="none"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - c * pct/100}
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
    </svg>
  );
};

export const Bar = ({ pct = 0, ok = false }) => (
  <div className="bar"><div className="bar-fill" data-ok={ok ? "true" : "false"} style={{width: `${pct}%`}}/></div>
);

export const Banner = ({ kind = "info", icon = "info", title, children }) => (
  <div className={`banner banner-${kind}`}>
    <span className="bn-icon"><Icon name={icon} size={16}/></span>
    <div>
      <div className="bn-title">{title}</div>
      {children && <div className="bn-body">{children}</div>}
    </div>
  </div>
);

export const EmptyState = ({ icon = "info", title, body }) => (
  <div className="empty">
    <div className="empty-icon"><Icon name={icon} size={24}/></div>
    <div className="empty-title">{title}</div>
    {body && <div className="empty-body">{body}</div>}
  </div>
);

export const Toggle = ({ on, onChange }) => (
  <button className={`tgl ${on ? "on" : ""}`} onClick={() => onChange(!on)}><span className="tgl-knob"/></button>
);

export const Segmented = ({ value, onChange, options }) => (
  <div className="seg">
    {options.map(o => (
      <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
    ))}
  </div>
);

export const PillTabs = ({ value, onChange, options }) => (
  <div className="pilltabs">
    {options.map(o => (
      <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
    ))}
  </div>
);

