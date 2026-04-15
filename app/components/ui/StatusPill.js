"use client";
import { A } from "./palette";

const DRAFT = {
  idle:     { label: "Pending",     bg: A.satelliteLight, color: A.textMuted },
  running:  { label: "Generating…", bg: A.horizonFaint,   color: A.horizonDark },
  done:     { label: "Ready",       bg: "#dcfce7",        color: "#16a34a" },
  error:    { label: "Error",       bg: "#fee2e2",        color: "#dc2626" },
};

const OUTREACH = {
  draft:       { label: "Draft",       bg: A.satelliteLight, color: A.textMuted },
  sent:        { label: "Sent",        bg: "#dbeafe",        color: "#1d4ed8" },
  replied:     { label: "Replied",     bg: "#dcfce7",        color: "#16a34a" },
  no_response: { label: "No response", bg: "#fef3c7",        color: "#92400e" },
};

export function DraftPill({ status }) {
  const s = DRAFT[status] ?? DRAFT.idle;
  return <Pill bg={s.bg} color={s.color} label={s.label} />;
}

export function OutreachPill({ status }) {
  const s = OUTREACH[status] ?? OUTREACH.draft;
  return <Pill bg={s.bg} color={s.color} label={s.label} />;
}

function Pill({ bg, color, label }) {
  return (
    <span style={{
      background: bg, color, fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}
