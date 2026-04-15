"use client";
import { A } from "./ui/palette";
import Avatar from "./ui/Avatar";
import { DraftPill } from "./ui/StatusPill";
import Btn from "./ui/Btn";

export default function LeadList({ leads, selectedId, onSelect, onAddLead }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${A.satelliteLight}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Leads</span>
        <Btn variant="primary" small onClick={onAddLead}>+ Add lead</Btn>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {leads.length === 0 && (
          <div style={{ padding: 24, color: A.textMuted, fontSize: 13, textAlign: "center" }}>
            No leads yet.
          </div>
        )}
        {leads.map(lead => (
          <div
            key={lead.id}
            onClick={() => onSelect(lead)}
            style={{
              padding: "10px 16px", cursor: "pointer",
              borderBottom: `1px solid ${A.satelliteLight}`,
              background: selectedId === lead.id ? A.horizonFaint : "transparent",
              borderLeft: selectedId === lead.id ? `3px solid ${A.horizon}` : "3px solid transparent",
              transition: "all 0.1s",
              display: "flex", alignItems: "center", gap: 10,
            }}
            onMouseEnter={e => { if (selectedId !== lead.id) e.currentTarget.style.background = A.satelliteLight; }}
            onMouseLeave={e => { if (selectedId !== lead.id) e.currentTarget.style.background = "transparent"; }}
          >
            <Avatar name={lead.name} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {lead.name}
              </div>
              {lead.title && (
                <div style={{ color: A.textMuted, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {lead.title}
                </div>
              )}
            </div>
            <DraftPill status={lead.draftStatus} />
          </div>
        ))}
      </div>
    </div>
  );
}
