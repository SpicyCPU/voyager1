"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { A } from "./ui/palette";
import Avatar from "./ui/Avatar";

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function TrackReasonBadge({ reason }) {
  const labels = {
    manual: null, // don't show — rep knows they added it
    auto_reply: { text: "Reply received", color: "#16a34a" },
    auto_leads: { text: "Active volume", color: "#2563eb" },
    ai_recommended: { text: "AI flagged", color: "#7c3aed" },
  };
  const meta = labels[reason];
  if (!meta) return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color: meta.color,
      background: meta.color + "18", padding: "2px 7px",
      borderRadius: 20, whiteSpace: "nowrap",
    }}>
      {meta.text}
    </span>
  );
}

function AccountRow({ acc, onTrackToggle }) {
  const router = useRouter();
  const lastLead = acc.leads?.[0];
  const leadCount = acc._count?.leads ?? 0;
  const repliedCount = acc.leads?.filter(l => l.outreachStatus === "replied").length ?? 0;
  const sentCount = acc.leads?.filter(l => l.outreachStatus === "sent").length ?? 0;
  const [toggling, setToggling] = useState(false);

  async function handleUntrack(e) {
    e.stopPropagation();
    setToggling(true);
    await onTrackToggle(acc.id, false);
    setToggling(false);
  }

  return (
    <tr
      onClick={() => router.push(`/accounts/${acc.id}`)}
      style={{
        borderBottom: `1px solid ${A.satelliteLight}`,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = A.satelliteLight}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <td style={{ padding: "12px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={acc.company} size={32} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{acc.company}</div>
            {acc.trackReason && <TrackReasonBadge reason={acc.trackReason} />}
          </div>
        </div>
      </td>
      <td style={{ padding: "12px 12px", color: A.textMuted, fontSize: 13 }}>
        <span style={{ fontWeight: 600, color: A.text }}>{leadCount}</span>
        {sentCount > 0 && <span> · {sentCount} sent</span>}
        {repliedCount > 0 && <span style={{ color: "#16a34a" }}> · {repliedCount} replied</span>}
      </td>
      <td style={{ padding: "12px 12px", color: A.textMuted, fontSize: 13 }}>
        {timeAgo(lastLead?.updatedAt)}
      </td>
      <td style={{ padding: "12px 6px 12px 12px" }}>
        <button
          onClick={handleUntrack}
          disabled={toggling}
          title="Remove from tracked accounts"
          style={{
            background: "none", border: `1px solid ${A.satellite}`,
            borderRadius: 6, cursor: "pointer", padding: "3px 8px",
            fontSize: 11, color: A.textMuted, fontFamily: "inherit",
            opacity: toggling ? 0.4 : 1, transition: "all 0.1s",
          }}
          onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.borderColor = "#dc2626"; e.currentTarget.style.color = "#dc2626"; }}
          onMouseLeave={e => { e.stopPropagation(); e.currentTarget.style.borderColor = A.satellite; e.currentTarget.style.color = A.textMuted; }}
        >
          Untrack
        </button>
      </td>
    </tr>
  );
}

function UntrackedRow({ acc, onTrackToggle }) {
  const router = useRouter();
  const leadCount = acc._count?.leads ?? 0;
  const [toggling, setToggling] = useState(false);

  async function handleTrack(e) {
    e.stopPropagation();
    setToggling(true);
    await onTrackToggle(acc.id, true);
    setToggling(false);
  }

  return (
    <tr
      onClick={() => router.push(`/accounts/${acc.id}`)}
      style={{
        borderBottom: `1px solid ${A.satelliteLight}`,
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = A.satelliteLight}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <td style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar name={acc.company} size={26} />
          <span style={{ fontSize: 13, color: A.text }}>{acc.company}</span>
          {acc._recommended && (
            <span style={{
              fontSize: 10, fontWeight: 600, color: "#7c3aed",
              background: "#7c3aed18", padding: "2px 7px", borderRadius: 20,
            }}>
              AI suggests
            </span>
          )}
        </div>
      </td>
      <td style={{ padding: "10px 12px", color: A.textMuted, fontSize: 12 }}>{leadCount} lead{leadCount !== 1 ? "s" : ""}</td>
      <td style={{ padding: "10px 12px", color: A.textMuted, fontSize: 12 }}>{timeAgo(acc.leads?.[0]?.updatedAt)}</td>
      <td style={{ padding: "10px 6px 10px 12px" }}>
        <button
          onClick={handleTrack}
          disabled={toggling}
          style={{
            background: "none", border: `1px solid ${A.satellite}`,
            borderRadius: 6, cursor: "pointer", padding: "3px 8px",
            fontSize: 11, color: A.textMuted, fontFamily: "inherit",
            opacity: toggling ? 0.4 : 1, transition: "all 0.1s",
          }}
          onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.borderColor = A.horizon; e.currentTarget.style.color = A.horizon; }}
          onMouseLeave={e => { e.stopPropagation(); e.currentTarget.style.borderColor = A.satellite; e.currentTarget.style.color = A.textMuted; }}
        >
          + Track
        </button>
      </td>
    </tr>
  );
}

export default function AccountList() {
  const [tracked, setTracked] = useState([]);
  const [untracked, setUntracked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUntracked, setShowUntracked] = useState(false);
  const [loadingUntracked, setLoadingUntracked] = useState(false);

  async function loadTracked() {
    const res = await fetch("/api/accounts?tracked=true");
    const d = await res.json();
    setTracked(d.accounts ?? []);
    setLoading(false);
  }

  async function loadUntracked() {
    setLoadingUntracked(true);
    const res = await fetch("/api/accounts?tracked=false");
    const d = await res.json();
    // Sort: AI-recommended first, then by lead count desc
    const sorted = (d.accounts ?? []).sort((a, b) => {
      if (a._recommended && !b._recommended) return -1;
      if (!a._recommended && b._recommended) return 1;
      return (b._count?.leads ?? 0) - (a._count?.leads ?? 0);
    });
    setUntracked(sorted);
    setLoadingUntracked(false);
  }

  useEffect(() => { loadTracked(); }, []);

  async function handleTrackToggle(accountId, trackValue) {
    await fetch(`/api/accounts/${accountId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracked: trackValue, trackReason: "manual" }),
    });
    // Move account between lists
    if (trackValue) {
      const acc = untracked.find(a => a.id === accountId);
      if (acc) {
        setUntracked(prev => prev.filter(a => a.id !== accountId));
        setTracked(prev => [{ ...acc, tracked: "1", trackReason: "manual" }, ...prev]);
      }
    } else {
      const acc = tracked.find(a => a.id === accountId);
      if (acc) {
        setTracked(prev => prev.filter(a => a.id !== accountId));
        setUntracked(prev => [{ ...acc, tracked: "0", trackReason: null }, ...prev]);
      }
    }
  }

  function handleToggleUntracked() {
    if (!showUntracked && untracked.length === 0) loadUntracked();
    setShowUntracked(v => !v);
  }

  if (loading) {
    return <div style={{ padding: 40, color: A.textMuted, textAlign: "center" }}>Loading…</div>;
  }

  const recommendedCount = untracked.filter(a => a._recommended).length;

  return (
    <div style={{ padding: "24px 24px 40px", maxWidth: 900, margin: "0 auto" }}>

      {/* Tracked accounts section */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: A.nebula }}>
            Tracked accounts
          </div>
          <div style={{ fontSize: 12, color: A.textMuted }}>
            {tracked.length === 0 ? "None yet" : `${tracked.length} account${tracked.length !== 1 ? "s" : ""}`}
          </div>
        </div>

        {tracked.length === 0 ? (
          <div style={{
            padding: "28px 24px", textAlign: "center",
            border: `1px dashed ${A.satellite}`, borderRadius: 10,
            color: A.textMuted, fontSize: 13,
          }}>
            No tracked accounts yet. Use <strong>☆ Track account</strong> during review, or track from the list below.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${A.satellite}` }}>
                {["Company", "Leads", "Last activity", ""].map(h => (
                  <th key={h} style={{
                    padding: "8px 12px", textAlign: "left",
                    fontSize: 11, fontWeight: 600, color: A.textMuted, textTransform: "uppercase",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tracked.map(acc => (
                <AccountRow key={acc.id} acc={acc} onTrackToggle={handleTrackToggle} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Untracked section — collapsed by default */}
      <div>
        <button
          onClick={handleToggleUntracked}
          style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            padding: 0, fontFamily: "inherit",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: A.textMuted }}>
            {showUntracked ? "▾" : "▸"} All other accounts
          </span>
          {recommendedCount > 0 && !showUntracked && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#7c3aed",
              background: "#7c3aed18", padding: "2px 7px", borderRadius: 20,
            }}>
              {recommendedCount} AI suggestion{recommendedCount !== 1 ? "s" : ""}
            </span>
          )}
        </button>

        {showUntracked && (
          <div style={{ marginTop: 12 }}>
            {loadingUntracked ? (
              <div style={{ padding: 20, color: A.textMuted, fontSize: 13 }}>Loading…</div>
            ) : untracked.length === 0 ? (
              <div style={{ padding: 20, color: A.textMuted, fontSize: 13 }}>No untracked accounts.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${A.satellite}` }}>
                    {["Company", "Leads", "Last activity", ""].map(h => (
                      <th key={h} style={{
                        padding: "6px 12px", textAlign: "left",
                        fontSize: 11, fontWeight: 600, color: A.textMuted, textTransform: "uppercase",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {untracked.map(acc => (
                    <UntrackedRow key={acc.id} acc={acc} onTrackToggle={handleTrackToggle} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
