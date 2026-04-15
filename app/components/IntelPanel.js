"use client";
import { useState } from "react";
import { A } from "./ui/palette";

export default function IntelPanel({ researchSummary }) {
  const [open, setOpen] = useState(false);
  if (!researchSummary) return null;

  return (
    <div style={{ border: `1px solid ${A.satellite}`, borderRadius: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: A.offWhite, border: "none", cursor: "pointer",
          padding: "8px 14px", display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, color: A.textMuted, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.05em", fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: 9 }}>{open ? "▲" : "▼"}</span>
        Intel Briefing
      </button>
      {open && (
        <div style={{
          padding: "10px 14px", fontSize: 13, color: A.text, lineHeight: 1.7,
          background: A.white, whiteSpace: "pre-wrap",
        }}>
          {researchSummary}
        </div>
      )}
    </div>
  );
}
