"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";
import Avatar from "./ui/Avatar";

const SIGNAL_LABELS = {
  webinar: "Webinar",
  web_visit: "Web Visit",
  job_posting: "Job Signal",
  customer_expansion: "Expansion",
  github_download: "GitHub",
  platform_signup: "Studio Sign-up",
  manual_entry: "Manual",
  other: "Signal",
};

function SignalBadge({ type }) {
  return (
    <span style={{
      fontSize: 11, background: A.horizonFaint, color: A.horizonDark,
      padding: "2px 8px", borderRadius: 20, fontWeight: 600, flexShrink: 0,
    }}>
      {SIGNAL_LABELS[type] ?? type?.replace(/_/g, " ") ?? "Signal"}
    </span>
  );
}

function StatusDot({ status }) {
  const colors = { done: "#16a34a", running: A.horizon, error: "#dc2626", idle: A.satellite };
  return (
    <div style={{
      width: 8, height: 8, borderRadius: "50%",
      background: colors[status] ?? A.satellite,
      flexShrink: 0,
    }} />
  );
}

function extractTier(extraContext) {
  if (!extraContext) return null;
  const match = extraContext.match(/Tier:\s*([^·\n]+)/);
  return match ? match[1].trim() : null;
}

function extractStudioOrg(extraContext) {
  if (!extraContext) return null;
  const match = extraContext.match(/Studio Org:\s*([^·\n]+)/);
  return match ? match[1].trim() : null;
}

function hasPaidOrgWarning(extraContext) {
  return extraContext?.includes("⚠️ Org has paid members") ?? false;
}

function extractGitHubCompany(extraContext) {
  if (!extraContext) return null;
  const match = extraContext.match(/GitHub Co:\s*([^·\n]+)/);
  return match ? match[1].trim() : null;
}

function extractGitHubLocation(extraContext) {
  if (!extraContext) return null;
  const match = extraContext.match(/Location:\s*([^·\n]+)/);
  return match ? match[1].trim() : null;
}

function formatEngagementDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date)) return null;
  const now = new Date();
  const days = Math.floor((now - date) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function accountMeta(account) {
  const parts = [];
  if (account?.headcount) parts.push(account.headcount + " emp.");
  if (account?.hq) {
    // "Salt Lake City, United States" → "Salt Lake City"
    const hq = account.hq.includes(",") ? account.hq.split(",")[0].trim() : account.hq;
    parts.push(hq);
  }
  if (account?.industry) parts.push(account.industry);
  return parts.join(" · ");
}

function TriageCard({ lead, onGenerate, onDiscard, generating }) {
  const isRunning = lead.draftStatus === "running";
  const isDone = lead.draftStatus === "done";
  const isError = lead.draftStatus === "error";
  const isIdle = lead.draftStatus === "idle";
  const tier = extractTier(lead.extraContext);
  const studioOrg = extractStudioOrg(lead.extraContext);
  const paidOrgWarning = hasPaidOrgWarning(lead.extraContext);
  const ghCompany = extractGitHubCompany(lead.extraContext);
  const ghLocation = extractGitHubLocation(lead.extraContext);
  const meta = accountMeta(lead.account);
  const engagedOn = formatEngagementDate(lead.lastSignalAt ?? lead.createdAt);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      background: isDone ? "#f0fdf4" : A.white,
      border: `1px solid ${isDone ? "#bbf7d0" : isError ? "#fecaca" : A.satellite}`,
      borderRadius: 8, transition: "border-color 0.15s",
    }}>
      <StatusDot status={lead.draftStatus} />
      <Avatar name={lead.name} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: A.text }}>{lead.name}</div>
        <div style={{ fontSize: 12, color: A.textMuted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lead.title ? `${lead.title}` : ""}
          {lead.title && lead.account?.company ? " · " : ""}
          {lead.account?.company ?? ""}
        </div>
        {(meta || lead.email || ghCompany || ghLocation) && (
          <div style={{ fontSize: 11, color: A.textMuted, marginTop: 1, opacity: 0.75 }}>
            {meta}
            {meta && lead.email ? " · " : ""}
            {lead.email && (
              <span style={{ fontFamily: "monospace", letterSpacing: "-0.01em" }}>{lead.email}</span>
            )}
            {(meta || lead.email) && (ghCompany || ghLocation) ? " · " : ""}
            {ghCompany && (
              <span title="Identified via GitHub profile" style={{ color: "#1d6e37" }}>
                ⌥ {ghCompany}{ghLocation ? ` · ${ghLocation}` : ""}
              </span>
            )}
            {!ghCompany && ghLocation && (
              <span>📍 {ghLocation}</span>
            )}
          </div>
        )}
      </div>
      {lead.signalType && <SignalBadge type={lead.signalType} />}
      {studioOrg && (
        <span style={{ fontSize: 11, color: A.textMuted, flexShrink: 0, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={studioOrg}>
          {studioOrg}
        </span>
      )}
      {paidOrgWarning && (
        <span style={{ fontSize: 11, color: "#b45309", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 4, padding: "1px 5px", flexShrink: 0, fontWeight: 600 }} title="Another member of this Studio Org is on a paid plan — verify if this person is net-new or already a customer">
          ⚠️ Verify
        </span>
      )}
      {tier && (
        <span style={{ fontSize: 11, color: A.textMuted, flexShrink: 0 }}>
          {tier} plan
        </span>
      )}
      {engagedOn && (
        <span style={{ fontSize: 11, color: A.textMuted, flexShrink: 0, opacity: 0.7 }}>
          {engagedOn}
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {isDone && (
          <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Ready ✓</span>
        )}
        {isRunning && (
          <span style={{ fontSize: 12, color: A.horizon }}>Generating…</span>
        )}
        {isError && (
          <Btn variant="ghost" small onClick={() => onGenerate(lead.id)} disabled={generating}>
            Retry
          </Btn>
        )}
        {isIdle && (
          <Btn variant="secondary" small onClick={() => onGenerate(lead.id)} disabled={generating}>
            Generate
          </Btn>
        )}
        {!isRunning && (
          <button
            onClick={() => onDiscard(lead.id)}
            title="Discard lead"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: A.textMuted, fontSize: 16, lineHeight: 1,
              padding: "2px 4px", borderRadius: 4,
              display: "flex", alignItems: "center",
              transition: "color 0.1s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#dc2626"}
            onMouseLeave={e => e.currentTarget.style.color = A.textMuted}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

const SORT_OPTIONS = [
  { key: "date_desc", label: "Newest first" },
  { key: "date_asc",  label: "Oldest first" },
  { key: "company",   label: "Company A–Z" },
  { key: "signal",    label: "Signal type" },
];

function sortLeads(leads, sortKey) {
  const copy = [...leads];
  if (sortKey === "date_desc") return copy.sort((a, b) => (b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1);
  if (sortKey === "date_asc")  return copy.sort((a, b) => (a.createdAt ?? "") > (b.createdAt ?? "") ? 1 : -1);
  if (sortKey === "company")   return copy.sort((a, b) => (a.account?.company ?? "").localeCompare(b.account?.company ?? ""));
  if (sortKey === "signal")    return copy.sort((a, b) => (a.signalType ?? "").localeCompare(b.signalType ?? ""));
  return copy;
}

export default function TriageBoard() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingIds, setGeneratingIds] = useState(new Set());
  const [generatingAll, setGeneratingAll] = useState(false);
  const [syncing, setSyncing] = useState(false);  // reserved for future use
  const [syncResult, setSyncResult] = useState(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("date_desc");

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/queue");
      const data = await res.json();
      setLeads(data.leads ?? []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // Poll while any lead is running
  useEffect(() => {
    const hasRunning = leads.some(l => l.draftStatus === "running");
    if (!hasRunning) return;
    const t = setInterval(fetchQueue, 3000);
    return () => clearInterval(t);
  }, [leads, fetchQueue]);

  async function generateOne(id) {
    setGeneratingIds(s => new Set([...s, id]));
    setLeads(ls => ls.map(l => l.id === id ? { ...l, draftStatus: "running" } : l));
    try {
      const res = await fetch(`/api/leads/${id}/generate`, { method: "POST" });
      const data = await res.json();
      if (data.lead) {
        setLeads(ls => ls.map(l => l.id === id ? { ...l, ...data.lead } : l));
      }
    } catch {
      setLeads(ls => ls.map(l => l.id === id ? { ...l, draftStatus: "error" } : l));
    } finally {
      setGeneratingIds(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function discardLead(id) {
    setLeads(ls => ls.filter(l => l.id !== id));
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  }

  async function generateAll() {
    const idle = leads.filter(l => l.draftStatus === "idle" || l.draftStatus === "error");
    if (!idle.length) return;
    setGeneratingAll(true);
    for (const lead of idle) {
      await generateOne(lead.id);
    }
    setGeneratingAll(false);
  }

  async function syncFromOmni() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync/omni", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setSyncResult({ ok: true, created: data.created, updated: data.updated });
      if (data.created > 0) await fetchQueue();
    } catch (err) {
      setSyncResult({ ok: false, error: err.message });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  }

  function startReview() {
    const done = leads.filter(l => l.draftStatus === "done");
    if (!done.length) return;
    const ids = done.map(l => l.id);
    sessionStorage.setItem("review_queue", JSON.stringify(ids));
    router.push(`/review/${ids[0]}`);
  }

  const q = query.trim().toLowerCase();
  const visible = q
    ? leads.filter(l =>
        l.name?.toLowerCase().includes(q) ||
        l.account?.company?.toLowerCase().includes(q) ||
        l.title?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.extraContext?.toLowerCase().includes(q)
      )
    : leads;

  const sorted = sortLeads(visible, sortKey);

  const idleLeads = sorted.filter(l => l.draftStatus === "idle");
  const runningLeads = sorted.filter(l => l.draftStatus === "running");
  const doneLeads = sorted.filter(l => l.draftStatus === "done");
  const errorLeads = sorted.filter(l => l.draftStatus === "error");

  const needsAction = idleLeads.length + errorLeads.length;
  const readyCount = doneLeads.length;
  const totalCount = leads.length;
  const accountCount = new Set(leads.map(l => l.accountId).filter(Boolean)).size;

  if (loading) {
    return (
      <div style={{ textAlign: "center", color: A.textMuted, fontSize: 14, paddingTop: 60 }}>
        Loading queue…
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div style={{ textAlign: "center", color: A.textMuted, fontSize: 13, padding: "60px 0" }}>
        Your leads for the day will automatically appear at 6AM each workday.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Summary + actions */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "14px 16px", background: A.white,
        border: `1px solid ${A.satellite}`, borderRadius: 10,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 22, color: A.nebula, lineHeight: 1 }}>
            {totalCount}
          </div>
          <div style={{ fontSize: 12, color: A.textMuted, marginTop: 2 }}>
            lead{totalCount !== 1 ? "s" : ""}
            {accountCount > 0 && ` · ${accountCount} account${accountCount !== 1 ? "s" : ""}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: A.textMuted }}>
          {doneLeads.length > 0 && (
            <span style={{ color: "#16a34a", fontWeight: 600 }}>
              {doneLeads.length} ready
            </span>
          )}
          {runningLeads.length > 0 && (
            <span style={{ color: A.horizon }}>
              {runningLeads.length} generating…
            </span>
          )}
          {idleLeads.length > 0 && (
            <span>{idleLeads.length} not yet generated</span>
          )}
          {errorLeads.length > 0 && (
            <span style={{ color: "#dc2626" }}>{errorLeads.length} failed</span>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value)}
          style={{
            fontSize: 12, padding: "5px 8px", borderRadius: 6,
            border: `1px solid ${A.satellite}`, outline: "none",
            color: A.text, background: A.offWhite, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search leads…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            fontSize: 12, padding: "5px 10px", borderRadius: 6,
            border: `1px solid ${A.satellite}`, outline: "none",
            width: 180, color: A.text, background: A.offWhite,
            fontFamily: "inherit",
          }}
          onFocus={e => e.target.style.borderColor = A.horizon}
          onBlur={e => e.target.style.borderColor = A.satellite}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {needsAction > 0 && (
            <Btn variant="secondary" onClick={generateAll} disabled={generatingAll}>
              {generatingAll ? "Generating…" : `Generate all (${needsAction})`}
            </Btn>
          )}
          <Btn
            variant="primary"
            onClick={startReview}
            disabled={readyCount === 0}
          >
            {readyCount === 0 ? "No drafts ready" : `Review ${readyCount} draft${readyCount !== 1 ? "s" : ""} →`}
          </Btn>
        </div>
      </div>

      {/* Ready leads */}
      {doneLeads.length > 0 && (
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase",
            letterSpacing: "0.05em", marginBottom: 6,
          }}>
            Ready to Review
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {doneLeads.map(lead => (
              <TriageCard key={lead.id} lead={lead} onGenerate={generateOne} onDiscard={discardLead} generating={generatingIds.has(lead.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Generating */}
      {runningLeads.length > 0 && (
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: A.horizon, textTransform: "uppercase",
            letterSpacing: "0.05em", marginBottom: 6,
          }}>
            Generating
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {runningLeads.map(lead => (
              <TriageCard key={lead.id} lead={lead} onGenerate={generateOne} onDiscard={discardLead} generating={generatingIds.has(lead.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {errorLeads.length > 0 && (
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase",
            letterSpacing: "0.05em", marginBottom: 6,
          }}>
            Failed — Retry
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {errorLeads.map(lead => (
              <TriageCard key={lead.id} lead={lead} onGenerate={generateOne} onDiscard={discardLead} generating={generatingIds.has(lead.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Needs generation */}
      {idleLeads.length > 0 && (
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: A.textMuted, textTransform: "uppercase",
            letterSpacing: "0.05em", marginBottom: 6,
          }}>
            Not Yet Generated
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {idleLeads.map(lead => (
              <TriageCard key={lead.id} lead={lead} onGenerate={generateOne} onDiscard={discardLead} generating={generatingIds.has(lead.id)} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
