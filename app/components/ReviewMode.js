"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";
import Avatar from "./ui/Avatar";
import IntelPanel from "./IntelPanel";
import LeadSourceCard from "./LeadSourceCard";
import ContextPanel from "./ContextPanel";
import FeedbackPanel from "./FeedbackPanel";
import CompletionScreen from "./CompletionScreen";
import { DraftPill } from "./ui/StatusPill";

function Timer({ startedAt }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return <span style={{ color: A.textMuted, fontSize: 12 }}>Generating... {secs}s</span>;
}

const inp = (extra = {}) => ({
  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 14,
  border: `1px solid ${A.satellite}`, background: A.white,
  outline: "none", color: A.text, fontFamily: "inherit", boxSizing: "border-box",
  ...extra,
});

export default function ReviewMode({ lead: initialLead, queueIds, currentIndex }) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [tab, setTab] = useState("email");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sending, setSending] = useState(false);
  const [generatingAt, setGeneratingAt] = useState(null);
  const [sentToday, setSentToday] = useState([]);
  const [done, setDone] = useState(false);
  const [tracked, setTracked] = useState(initialLead?.account?.tracked === "1");
  const [tracking, setTracking] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const saveTimer = useRef(null);

  const total = queueIds.length;
  const position = currentIndex + 1;
  const nextId = queueIds[currentIndex + 1] ?? null;

  // Reset state when lead changes
  useEffect(() => {
    setLead(initialLead);
    setTab("email");
    setSendError(null);
    setSaveError(false);
    setTracked(initialLead?.account?.tracked === "1");
  }, [initialLead?.id]);

  // Poll while generating
  useEffect(() => {
    if (lead.draftStatus !== "running") { setGeneratingAt(null); return; }
    if (!generatingAt) setGeneratingAt(Date.now());
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/leads/${lead.id}`);
        const data = await res.json();
        if (data.lead && data.lead.draftStatus !== "running") {
          setLead(data.lead); setGeneratingAt(null); clearInterval(t);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [lead.draftStatus]);

  async function generate() {
    const res = await fetch(`/api/leads/${lead.id}/generate`, { method: "POST" });
    const data = await res.json();
    if (data.lead) setLead(data.lead);
  }

  function scheduleAutoSave(field, value) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true); setSaveError(false);
      try {
        const res = await fetch(`/api/leads/${lead.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.lead) setLead(data.lead);
      } catch {
        setSaveError(true);
      } finally {
        setSaving(false);
      }
    }, 500);
  }

  async function sendAndNext() {
    setSendError(null); setSending(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/send`, { method: "POST" });
      if (!res.ok) throw new Error("Send failed — try again.");
      const data = await res.json();
      const sent = { ...lead, ...data.lead };
      const todayList = [...sentToday, sent];
      if (nextId) {
        setSentToday(todayList);
        router.push(`/review/${nextId}`);
      } else {
        setSentToday(todayList);
        setDone(true);
        sessionStorage.removeItem("review_queue");
      }
    } catch (e) {
      setSendError(e.message || "Send failed — try again.");
    } finally {
      setSending(false);
    }
  }

  function skip() {
    if (nextId) {
      router.push(`/review/${nextId}`);
    } else {
      setDone(true);
      sessionStorage.removeItem("review_queue");
    }
  }

  async function handleDelete() {
    await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    if (nextId) {
      router.push(`/review/${nextId}`);
    } else {
      setDone(true);
      sessionStorage.removeItem("review_queue");
    }
  }

  function copy() {
    const text = tab === "email"
      ? `Subject: ${lead.emailSubject ?? ""}\n\n${lead.emailDraft ?? ""}`
      : (lead.linkedinNote ?? "");
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  function handleRefined(field, text) {
    setLead(l => ({ ...l, [field]: text }));
    scheduleAutoSave(field, text);
  }

  async function toggleTrack() {
    if (!lead.account?.id) return;
    setTracking(true);
    try {
      await fetch(`/api/accounts/${lead.account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracked: !tracked, trackReason: "manual" }),
      });
      setTracked(t => !t);
    } finally {
      setTracking(false);
    }
  }

  if (done) return <CompletionScreen sentToday={sentToday} />;

  const isRunning = lead.draftStatus === "running";
  const hasEmail = !!lead.emailDraft;

  return (
    <div style={{ minHeight: "calc(100vh - 92px)", background: A.offWhite }}>
      {/* Header bar */}
      <div style={{
        background: A.white, borderBottom: `1px solid ${A.satellite}`,
        padding: "10px 24px", display: "flex", alignItems: "center", gap: 16,
      }}>
        <button
          onClick={() => router.push("/")}
          style={{
            background: "none", border: "none", cursor: "pointer", color: A.textMuted,
            fontSize: 13, display: "flex", alignItems: "center", gap: 4, padding: 0,
            fontFamily: "inherit",
          }}
        >
          ← Dashboard
        </button>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={lead.name} size={28} />
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: A.text }}>{lead.name}</span>
            {lead.account?.company && (
              <span style={{ color: A.textMuted, fontSize: 13 }}> at {lead.account.company}</span>
            )}
          </div>
        </div>
        <Btn variant="ghost" small onClick={handleDelete} disabled={sending}>Discard</Btn>
        <Btn variant="ghost" small onClick={skip} disabled={sending}>Skip</Btn>
        <div style={{ color: A.textMuted, fontSize: 13, fontWeight: 500 }}>
          {position} of {total} lead{total !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Lead meta row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {lead.title && (
            <span style={{ color: A.textMuted, fontSize: 13 }}>{lead.title}</span>
          )}
          {lead.email && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(lead.email).catch(() => {});
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 1500);
              }}
              title="Copy email address"
              style={{
                background: "none", border: `1px solid ${A.satellite}`,
                borderRadius: 5, cursor: "pointer", padding: "2px 8px",
                fontSize: 12, color: emailCopied ? "#16a34a" : A.textMuted,
                fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
                transition: "all 0.12s",
              }}
            >
              {emailCopied ? "✓ Copied" : lead.email}
            </button>
          )}
          {lead.signalType && (
            <span style={{
              fontSize: 11, background: A.horizonFaint, color: A.horizonDark,
              padding: "2px 8px", borderRadius: 20, fontWeight: 600,
            }}>
              {lead.signalType.replace(/_/g, " ")}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {saving && <span style={{ fontSize: 11, color: A.textMuted }}>Saving…</span>}
          {saveError && (
            <span style={{ fontSize: 11, color: "#dc2626" }}>
              Save failed — check connection
            </span>
          )}
          <DraftPill status={lead.draftStatus} />
        </div>

        {/* Lead source — qualifying signals */}
        <LeadSourceCard lead={lead} />

        {/* Intel briefing */}
        <IntelPanel researchSummary={lead.researchSummary} />

        {/* Enrichment context — Common Room, Pages Visited, Salesforce */}
        <ContextPanel
          lead={lead}
          onSaved={({ account, lead: updatedLead } = {}) => {
            if (account) setLead(l => ({ ...l, account: { ...l.account, ...account } }));
            if (updatedLead) setLead(l => ({ ...l, ...updatedLead }));
          }}
        />

        {/* Generate button (safety net — only when no draft) */}
        {!hasEmail && (
          <div style={{
            padding: "14px 16px", background: A.white,
            border: `1px solid ${A.satellite}`, borderRadius: 8,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <Btn variant="primary" onClick={generate} disabled={isRunning}>
              {isRunning ? "Generating…" : lead.draftStatus === "error" ? "Retry Generate" : "Generate Draft"}
            </Btn>
            {isRunning && generatingAt && <Timer startedAt={generatingAt} />}
            {lead.draftStatus === "error" && (
              <span style={{ color: "#dc2626", fontSize: 12 }}>Generation failed</span>
            )}
          </div>
        )}

        {/* Draft editor */}
        {(hasEmail || isRunning) && (
          <div style={{
            background: A.white, border: `1px solid ${A.satellite}`,
            borderRadius: 8, overflow: "hidden",
          }}>
            {/* Tab switcher */}
            <div style={{
              display: "flex", borderBottom: `1px solid ${A.satellite}`, alignItems: "center",
            }}>
              {["email", "linkedin"].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: "10px 20px", background: "none", border: "none",
                  borderBottom: tab === t ? `2px solid ${A.horizon}` : "2px solid transparent",
                  color: tab === t ? A.horizon : A.textMuted,
                  fontWeight: tab === t ? 600 : 400, fontSize: 13, cursor: "pointer",
                  marginBottom: -1, fontFamily: "inherit",
                }}>
                  {t === "email" ? "Email" : "LinkedIn"}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 6, padding: "0 12px" }}>
                <Btn variant="ghost" small onClick={copy}>{copied ? "Copied ✓" : "Copy"}</Btn>
                <Btn variant="secondary" small onClick={generate} disabled={isRunning}>
                  Regenerate
                </Btn>
              </div>
            </div>

            {/* Generating skeleton */}
            {isRunning && (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                {[1, 0.7, 0.9, 0.5].map((w, i) => (
                  <div key={i} style={{
                    height: 14, width: `${w * 100}%`, background: A.satelliteLight,
                    borderRadius: 4, opacity: 0.8,
                  }} />
                ))}
                {generatingAt && (
                  <div style={{ marginTop: 4 }}>
                    <Timer startedAt={generatingAt} />
                  </div>
                )}
              </div>
            )}

            {/* Email tab */}
            {!isRunning && tab === "email" && (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={{
                    fontSize: 11, fontWeight: 700, color: A.textMuted,
                    textTransform: "uppercase", display: "block", marginBottom: 4,
                    letterSpacing: "0.05em",
                  }}>Subject</label>
                  <input
                    style={inp()}
                    value={lead.emailSubject ?? ""}
                    onChange={e => setLead(l => ({ ...l, emailSubject: e.target.value }))}
                    onBlur={e => scheduleAutoSave("emailSubject", e.target.value)}
                  />
                </div>
                <div>
                  <label style={{
                    fontSize: 11, fontWeight: 700, color: A.textMuted,
                    textTransform: "uppercase", display: "block", marginBottom: 4,
                    letterSpacing: "0.05em",
                  }}>Body</label>
                  <textarea
                    style={inp({ minHeight: 200, resize: "vertical" })}
                    value={lead.emailDraft ?? ""}
                    onChange={e => setLead(l => ({ ...l, emailDraft: e.target.value }))}
                    onBlur={e => scheduleAutoSave("emailDraft", e.target.value)}
                  />
                </div>
                <FeedbackPanel lead={lead} field="emailDraft" onRefined={handleRefined} />
              </div>
            )}

            {/* LinkedIn tab */}
            {!isRunning && tab === "linkedin" && (
              <div style={{ padding: 16 }}>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: A.textMuted,
                  textTransform: "uppercase", display: "block", marginBottom: 4,
                  letterSpacing: "0.05em",
                }}>Message</label>
                <textarea
                  style={inp({ minHeight: 130, resize: "vertical" })}
                  value={lead.linkedinNote ?? ""}
                  onChange={e => setLead(l => ({ ...l, linkedinNote: e.target.value }))}
                  onBlur={e => scheduleAutoSave("linkedinNote", e.target.value)}
                />
                <FeedbackPanel lead={lead} field="linkedinNote" onRefined={handleRefined} />
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        <div style={{
          display: "flex", gap: 10, alignItems: "center",
          background: A.white, border: `1px solid ${A.satellite}`,
          borderRadius: 8, padding: "12px 16px",
        }}>
          <button
            onClick={toggleTrack}
            disabled={tracking || sending}
            title={tracked ? "Remove from tracked accounts" : "Track this account"}
            style={{
              background: "none", border: `1px solid ${tracked ? A.horizon : A.satellite}`,
              borderRadius: 6, cursor: "pointer", padding: "5px 10px",
              fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              color: tracked ? A.horizon : A.textMuted,
              display: "flex", alignItems: "center", gap: 5,
              transition: "all 0.12s",
              opacity: tracking ? 0.5 : 1,
            }}
          >
            {tracked ? "★ Tracked" : "☆ Track account"}
          </button>
          <div style={{ flex: 1 }} />
          {sendError && (
            <span style={{ fontSize: 12, color: "#dc2626" }}>{sendError}</span>
          )}
          <Btn
            variant="success"
            onClick={sendAndNext}
            disabled={sending || isRunning || !hasEmail}
          >
            {sending ? "Sending…" : nextId ? "Send & Next →" : "Send & Finish →"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
