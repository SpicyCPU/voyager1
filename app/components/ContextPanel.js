"use client";
import { useState, useRef } from "react";
import { A } from "./ui/palette";

// Collapsible panel for manually adding enrichment context before generating.
// Three sections:
//   - Common Room (account-level — will be auto-populated when CR API is available)
//   - Pages Visited (lead-level — visitedUrls)
//   - Salesforce (account-level — deal stage, open opps, history)
//
// All fields auto-save on blur. Parent is notified via onSaved so it can
// refresh the lead/account state before regenerating.

const ta = {
  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12,
  border: `1px solid ${A.satellite}`, background: A.white,
  outline: "none", color: A.text, fontFamily: "inherit",
  boxSizing: "border-box", resize: "vertical", minHeight: 70, lineHeight: 1.5,
};

function Field({ label, placeholder, value, onChange, onBlur, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <label style={{
          fontSize: 11, fontWeight: 700, color: A.textMuted,
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>{label}</label>
        {hint && (
          <span style={{ fontSize: 10, color: A.satellite, fontStyle: "italic" }}>{hint}</span>
        )}
      </div>
      <textarea
        style={ta}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        onBlur={onBlur}
      />
    </div>
  );
}

export default function ContextPanel({ lead, onSaved }) {
  const [open, setOpen] = useState(
    // Auto-open if any context already exists
    !!(lead.account?.crEnrichment || lead.account?.sfContext || lead.visitedUrls)
  );
  const [crEnrichment, setCrEnrichment] = useState(lead.account?.crEnrichment ?? "");
  const [sfContext, setSfContext] = useState(lead.account?.sfContext ?? "");
  const [visitedUrls, setVisitedUrls] = useState(lead.visitedUrls ?? "");
  const [saving, setSaving] = useState(false);

  async function saveAccount(updates) {
    if (!lead.account?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${lead.account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.account) onSaved?.({ account: data.account });
    } catch {}
    finally { setSaving(false); }
  }

  async function saveLead(updates) {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.lead) onSaved?.({ lead: data.lead });
    } catch {}
    finally { setSaving(false); }
  }

  const hasContent = crEnrichment.trim() || sfContext.trim() || visitedUrls.trim();

  return (
    <div style={{
      background: A.white, border: `1px solid ${A.satellite}`,
      borderRadius: 8, overflow: "hidden",
    }}>
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "11px 16px", display: "flex", alignItems: "center", gap: 8,
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 11, color: A.textMuted, transition: "transform 0.15s",
          display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          ▶
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: A.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Context
        </span>
        {hasContent && !open && (
          <span style={{
            fontSize: 10, background: A.horizonFaint, color: A.horizonDark,
            padding: "1px 6px", borderRadius: 10, fontWeight: 600,
          }}>
            {[crEnrichment, sfContext, visitedUrls].filter(v => v.trim()).length} field{[crEnrichment, sfContext, visitedUrls].filter(v => v.trim()).length !== 1 ? "s" : ""} filled
          </span>
        )}
        {saving && (
          <span style={{ fontSize: 11, color: A.textMuted, marginLeft: "auto" }}>Saving…</span>
        )}
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding: "4px 16px 16px" }}>
          <Field
            label="Common Room"
            hint="paste signals summary — auto-populated when CR is connected"
            placeholder="e.g. Visited /pricing 3x in the last 7 days. Attended Apollo webinar April 2nd. Job posting for GraphQL Platform Engineer."
            value={crEnrichment}
            onChange={e => setCrEnrichment(e.target.value)}
            onBlur={e => saveAccount({ crEnrichment: e.target.value })}
          />
          <Field
            label="Pages Visited"
            hint="URLs or page names"
            placeholder="e.g. /pricing, /federation, /connectors/getting-started"
            value={visitedUrls}
            onChange={e => setVisitedUrls(e.target.value)}
            onBlur={e => saveLead({ visitedUrls: e.target.value })}
          />
          <Field
            label="Salesforce"
            hint="deal stage, owner, open opps, history"
            placeholder="e.g. Open opp $40k, Stage 2. Last touched by Sarah Jones (AE) Jan 15. Previous trial expired Q3 2024."
            value={sfContext}
            onChange={e => setSfContext(e.target.value)}
            onBlur={e => saveAccount({ sfContext: e.target.value })}
          />
          <div style={{ fontSize: 11, color: A.textMuted, marginTop: 4 }}>
            Context is saved per account (Common Room, Salesforce) or per lead (Pages Visited) and injected into every draft generation.
          </div>
        </div>
      )}
    </div>
  );
}
