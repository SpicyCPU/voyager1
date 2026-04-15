"use client";
import { useState } from "react";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";

export default function FeedbackPanel({ lead, field, onRefined }) {
  const [feedback, setFeedback] = useState("");
  const [refining, setRefining] = useState(false);
  const [history, setHistory] = useState([]);

  const [stored, setStored] = useState(false);
  const [storedDismissed, setStoredDismissed] = useState(false);

  async function refine() {
    if (!feedback.trim()) return;
    setRefining(true);
    setStored(false);
    setStoredDismissed(false);

    const currentText = field === "emailDraft" ? lead.emailDraft : lead.linkedinNote;
    const capturedFeedback = feedback;
    setHistory(h => [...h, currentText]);
    setFeedback("");

    try {
      const res = await fetch(`/api/leads/${lead.id}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, feedback: capturedFeedback, currentText }),
      });
      const data = await res.json();
      onRefined?.(field, data.updatedText);
      setStored(true);
    } finally {
      setRefining(false);
    }
  }

  function undo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    onRefined?.(field, prev);
  }

  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 8,
      background: A.offWhite, border: `1px solid ${A.satellite}`,
    }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: A.textMuted, marginBottom: 8 }}>
        REFINE WITH AI
      </div>
      <textarea
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
        placeholder="e.g. Make it shorter. Lead with the job posting signal. Tone down the opener."
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12,
          border: `1px solid ${A.satellite}`, background: A.white,
          outline: "none", color: A.text, minHeight: 60, resize: "vertical",
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
        {history.length > 0 && (
          <Btn variant="ghost" small onClick={undo}>Undo</Btn>
        )}
        <Btn variant="secondary" small onClick={refine} disabled={refining || !feedback.trim()}>
          {refining ? "Refining…" : "Refine →"}
        </Btn>
      </div>

      {stored && !storedDismissed && (
        <div style={{
          marginTop: 10, padding: "7px 10px",
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>✦</span>
          <div style={{ flex: 1, fontSize: 12, color: "#166534" }}>
            <strong>Stored in memory</strong> — will influence future drafts automatically.
          </div>
          <button
            onClick={() => setStoredDismissed(true)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#15803d", fontSize: 16, padding: "0 2px",
              fontFamily: "inherit", flexShrink: 0, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
