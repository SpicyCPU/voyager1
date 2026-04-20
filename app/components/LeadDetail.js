"use client";
import { useState, useEffect } from "react";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";
import Avatar from "./ui/Avatar";
import { DraftPill, OutreachPill } from "./ui/StatusPill";
import FeedbackPanel from "./FeedbackPanel";


const inp = (extra = {}) => ({
  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
  border: `1px solid ${A.satellite}`, background: A.white,
  outline: "none", color: A.text, ...extra,
});

function InsightCard({ title, content }) {
  if (!content) return null;
  return (
    <div style={{
      padding: 12, borderRadius: 8, background: A.offWhite,
      border: `1px solid ${A.satellite}`, flex: 1,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: A.textMuted, textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: A.text, lineHeight: 1.5 }}>{content}</div>
    </div>
  );
}

function Timer({ startedAt }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return <span style={{ color: A.textMuted, fontSize: 12 }}>{secs}s</span>;
}

export default function LeadDetail({ lead: initialLead, onUpdated, onEdit, onDelete }) {
  const [lead, setLead] = useState(initialLead);
  const [tab, setTab] = useState("email");
  const [copied, setCopied] = useState(false);
  const [generatingAt, setGeneratingAt] = useState(null);

  useEffect(() => { setLead(initialLead); }, [initialLead]);

  // Poll while generating
  useEffect(() => {
    if (lead.draftStatus !== "running") { setGeneratingAt(null); return; }
    if (!generatingAt) setGeneratingAt(Date.now());
    const t = setInterval(async () => {
      const res = await fetch(`/api/accounts/${lead.accountId}`);
      const data = await res.json();
      const updated = data.leads?.find(l => l.id === lead.id);
      if (updated && updated.draftStatus !== "running") {
        setLead(updated); onUpdated?.(updated); setGeneratingAt(null);
        clearInterval(t);
      }
    }, 2000);
    return () => clearInterval(t);
  }, [lead.draftStatus]);

  async function generate() {
    setLead(l => ({ ...l, draftStatus: "running" }));
    try {
      const res = await fetch(`/api/leads/${lead.id}/generate`, { method: "POST" });
      const data = await res.json();
      if (data.lead) {
        setLead(data.lead); onUpdated?.(data.lead);
      } else {
        setLead(l => ({ ...l, draftStatus: "error" }));
        console.error("Generate failed:", data.error);
      }
    } catch (err) {
      setLead(l => ({ ...l, draftStatus: "error" }));
      console.error("Generate error:", err);
    }
  }

  async function markSent() {
    const res = await fetch(`/api/leads/${lead.id}/send`, { method: "POST" });
    const data = await res.json();
    if (data.lead) { setLead(data.lead); onUpdated?.(data.lead); }
  }

  async function saveField(field, value) {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    if (data.lead) { setLead(data.lead); onUpdated?.(data.lead); }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${lead.name}?`)) return;
    await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    onDelete?.(lead.id);
  }

  function copy() {
    const text = tab === "email"
      ? `Subject: ${lead.emailSubject ?? ""}\n\n${lead.emailDraft ?? ""}`
      : (lead.linkedinNote ?? "");
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  function handleRefined(field, text) {
    setLead(l => ({ ...l, [field]: text }));
    saveField(field, text);
  }

  const isRunning = lead.draftStatus === "running";
  const hasEmail = !!lead.emailDraft;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${A.satelliteLight}`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Avatar name={lead.name} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{lead.name}</div>
          {lead.title && <div style={{ color: A.textMuted, fontSize: 12 }}>{lead.title}</div>}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              style={{ fontSize: 12, color: A.horizon, textDecoration: "none" }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
              onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
            >
              {lead.email}
            </a>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <DraftPill status={lead.draftStatus} />
          <OutreachPill status={lead.outreachStatus} />
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Research summary */}
        {lead.researchSummary && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: A.textMuted, textTransform: "uppercase", marginBottom: 6 }}>Intel Briefing</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <InsightCard title="Research" content={lead.researchSummary} />
            </div>
          </div>
        )}

        {/* Generate button */}
        {!hasEmail && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Btn variant="primary" onClick={generate} disabled={isRunning}>
              {isRunning ? "Generating…" : lead.draftStatus === "error" ? "Retry" : "Generate"}
            </Btn>
            {isRunning && generatingAt && <Timer startedAt={generatingAt} />}
            {lead.draftStatus === "error" && (
              <span style={{ color: "#dc2626", fontSize: 12 }}>Generation failed</span>
            )}
          </div>
        )}

        {/* Email / LinkedIn tabs */}
        {hasEmail && (
          <div>
            {/* Tab switcher */}
            <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${A.satellite}` }}>
              {["email", "linkedin"].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: "6px 16px", background: "none", border: "none",
                  borderBottom: tab === t ? `2px solid ${A.horizon}` : "2px solid transparent",
                  color: tab === t ? A.horizon : A.textMuted,
                  fontWeight: tab === t ? 600 : 400, fontSize: 13, cursor: "pointer",
                  marginBottom: -1,
                }}>
                  {t === "email" ? "Email" : "LinkedIn"}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 6, alignItems: "center", paddingBottom: 4 }}>
                <Btn variant="ghost" small onClick={copy}>{copied ? "Copied ✓" : "Copy"}</Btn>
                <Btn variant="secondary" small onClick={generate} disabled={isRunning}>Regenerate</Btn>
              </div>
            </div>

            {/* Email tab */}
            {tab === "email" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: A.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Subject</div>
                  <input
                    style={inp()}
                    value={lead.emailSubject ?? ""}
                    onChange={e => setLead(l => ({ ...l, emailSubject: e.target.value }))}
                    onBlur={e => saveField("emailSubject", e.target.value)}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: A.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Body</div>
                  <textarea
                    style={inp({ minHeight: 180, resize: "vertical" })}
                    value={lead.emailDraft ?? ""}
                    onChange={e => setLead(l => ({ ...l, emailDraft: e.target.value }))}
                    onBlur={e => saveField("emailDraft", e.target.value)}
                  />
                </div>
                <FeedbackPanel lead={lead} field="emailDraft" onRefined={handleRefined} />
              </div>
            )}

            {/* LinkedIn tab */}
            {tab === "linkedin" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: A.textMuted, textTransform: "uppercase", marginBottom: 4 }}>Message</div>
                <textarea
                  style={inp({ minHeight: 120, resize: "vertical" })}
                  value={lead.linkedinNote ?? ""}
                  onChange={e => setLead(l => ({ ...l, linkedinNote: e.target.value }))}
                  onBlur={e => saveField("linkedinNote", e.target.value)}
                />
                <FeedbackPanel lead={lead} field="linkedinNote" onRefined={handleRefined} />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${A.satelliteLight}`, paddingTop: 12 }}>
          {hasEmail && lead.outreachStatus === "draft" && (
            <Btn variant="success" onClick={markSent}>Mark sent</Btn>
          )}
          {hasEmail && lead.email && (
            <Btn variant="secondary" onClick={() => {
              // Gmail MCP — browser-initiated
              navigator.clipboard.writeText(`Subject: ${lead.emailSubject}\n\n${lead.emailDraft}`);
            }}>Copy for Gmail</Btn>
          )}
          <Btn variant="ghost" onClick={() => onEdit?.(lead)}>Edit prospect</Btn>
          <Btn variant="danger" small onClick={handleDelete}>Delete</Btn>
        </div>
      </div>
    </div>
  );
}
