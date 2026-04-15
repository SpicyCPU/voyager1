"use client";
import { useEffect, useState } from "react";
import { A } from "./ui/palette";
import Avatar from "./ui/Avatar";

function workDaysSince(dateStr) {
  if (!dateStr) return 0;
  let count = 0, d = new Date(dateStr);
  const now = new Date();
  while (d < now) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export default function SentView({ onSelectLead }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/accounts")
      .then(r => r.json())
      .then(async data => {
        const all = [];
        for (const acc of data.accounts ?? []) {
          const res = await fetch(`/api/accounts/${acc.id}`);
          const d = await res.json();
          (d.leads ?? []).filter(l => l.outreachStatus === "sent").forEach(l => {
            all.push({ ...l, account: acc });
          });
        }
        all.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
        setLeads(all);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ padding: 40, color: A.textMuted, textAlign: "center" }}>Loading…</div>;

  if (leads.length === 0) {
    return (
      <div style={{ padding: 80, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
        <div style={{ color: A.text, fontWeight: 600, fontSize: 16, marginBottom: 8 }}>No sent emails yet</div>
        <div style={{ color: A.textMuted, fontSize: 13 }}>Mark a lead as sent to see it here.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      {leads.map(lead => {
        const days = workDaysSince(lead.sentAt);
        const overdue = days >= 3;
        return (
          <div
            key={lead.id}
            onClick={() => onSelectLead?.(lead)}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
              borderBottom: `1px solid ${A.satelliteLight}`, cursor: "pointer",
              borderRadius: 8, marginBottom: 2,
            }}
            onMouseEnter={e => e.currentTarget.style.background = A.satelliteLight}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <Avatar name={lead.name} size={36} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{lead.name}</div>
              <div style={{ color: A.textMuted, fontSize: 12 }}>
                {lead.title ? `${lead.title} · ` : ""}{lead.account?.company}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: overdue ? "#dc2626" : A.textMuted, fontWeight: overdue ? 600 : 400 }}>
                {days === 0 ? "Today" : `${days}d ago`}
                {overdue && " ⚠"}
              </div>
              <div style={{ fontSize: 11, color: A.textMuted }}>
                {lead.sentAt ? new Date(lead.sentAt).toLocaleDateString() : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
