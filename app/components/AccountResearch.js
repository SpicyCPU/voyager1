"use client";
import { useState } from "react";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";

const lbl = { fontSize: 11, fontWeight: 600, color: A.textMuted, textTransform: "uppercase", marginBottom: 4, display: "block", letterSpacing: "0.04em" };
const ta = {
  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12,
  border: `1px solid ${A.satellite}`, background: A.white,
  outline: "none", color: A.text, minHeight: 70, resize: "vertical",
  boxSizing: "border-box",
};
const inp = {
  width: "100%", padding: "7px 10px", borderRadius: 6, fontSize: 13,
  border: `1px solid ${A.satellite}`, background: A.white,
  outline: "none", color: A.text, fontFamily: "inherit", boxSizing: "border-box",
};

function researchAge(webResearchAt) {
  if (!webResearchAt) return null;
  const days = Math.floor((Date.now() - new Date(webResearchAt).getTime()) / 86400000);
  if (days === 0) return "Researched today";
  if (days === 1) return "Researched yesterday";
  return `Researched ${days} days ago`;
}

export default function AccountResearch({ account, leads, onAccountUpdated, onToggleTrack }) {
  const sent = leads.filter(l => l.outreachStatus === "sent").length;
  const replied = leads.filter(l => l.outreachStatus === "replied").length;

  // Identity fields (company name, sourced via, vendor domains)
  const [editingName, setEditingName] = useState(false);
  const [companyDraft, setCompanyDraft] = useState(account.company);
  const [nameError, setNameError] = useState(null);
  const [savingName, setSavingName] = useState(false);

  // Research fields
  const [fields, setFields] = useState({
    webResearch: account.webResearch ?? "",
    edgarData: account.edgarData ?? "",
    jobSignals: account.jobSignals ?? "",
    accountNotes: account.accountNotes ?? "",
  });
  const [webResearchAt, setWebResearchAt] = useState(account.webResearchAt ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  function setField(key) { return e => setFields(f => ({ ...f, [key]: e.target.value })); }

  async function saveName() {
    const trimmed = companyDraft.trim();
    if (!trimmed || trimmed === account.company) { setEditingName(false); setNameError(null); return; }
    setSavingName(true); setNameError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) { setNameError(data.error ?? "Failed to rename"); return; }
      setEditingName(false);
      onAccountUpdated?.({ ...account, ...data.account });
    } finally {
      setSavingName(false);
    }
  }

  async function save() {
    setSaving(true); setSaved(false);
    await fetch(`/api/accounts/${account.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onAccountUpdated?.({ ...account, ...fields });
  }

  async function refreshResearch() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}/research`, { method: "POST" });
      const data = await res.json();
      if (data.account) {
        const { webResearch, jobSignals, edgarData, webResearchAt: rat } = data.account;
        setFields(f => ({ ...f, webResearch: webResearch ?? "", jobSignals: jobSignals ?? "", edgarData: edgarData ?? "" }));
        setWebResearchAt(rat ?? null);
        onAccountUpdated?.({ ...account, ...data.account });
      }
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>

      {/* Account summary card */}
      <div style={{ background: A.nebula, padding: "16px 20px", borderRadius: "8px 8px 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>

          {/* Editable company name */}
          {editingName ? (
            <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", marginRight: 8 }}>
              <input
                autoFocus
                value={companyDraft}
                onChange={e => { setCompanyDraft(e.target.value); setNameError(null); }}
                onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditingName(false); setCompanyDraft(account.company); setNameError(null); } }}
                style={{
                  ...inp, flex: 1, fontSize: 14, fontWeight: 700,
                  background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.3)",
                  color: A.white,
                }}
              />
              <button onClick={saveName} disabled={savingName} style={{
                background: A.horizon, border: "none", borderRadius: 5,
                color: A.white, fontSize: 11, fontWeight: 700,
                padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              }}>
                {savingName ? "…" : "Save"}
              </button>
              <button onClick={() => { setEditingName(false); setCompanyDraft(account.company); setNameError(null); }} style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.5)",
                fontSize: 16, cursor: "pointer", padding: "2px 4px", lineHeight: 1,
              }}>✕</button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingName(true); setCompanyDraft(account.company); }}
              title="Rename account"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                fontWeight: 700, fontSize: 15, color: A.white, fontFamily: "inherit",
                textAlign: "left", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {account.company}
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>✎</span>
            </button>
          )}

          {onToggleTrack && (
            <button
              onClick={onToggleTrack}
              title={account.tracked === "1" ? "Untrack this account" : "Track this account"}
              style={{
                background: account.tracked === "1" ? A.horizon : "transparent",
                border: `1px solid ${account.tracked === "1" ? A.horizon : "rgba(255,255,255,0.3)"}`,
                borderRadius: 6, cursor: "pointer", padding: "3px 10px",
                fontSize: 11, fontWeight: 700, color: A.white, fontFamily: "inherit",
                transition: "all 0.12s", flexShrink: 0,
              }}
            >
              {account.tracked === "1" ? "★ Tracked" : "☆ Track"}
            </button>
          )}
        </div>

        {nameError && (
          <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 8 }}>{nameError}</div>
        )}

        {/* Account meta chips */}
        {(account.headcount || account.hq || account.industry) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {account.headcount && account.headcount !== "unknown" && (
              <span style={{
                fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)",
                background: "rgba(255,255,255,0.12)", padding: "2px 8px",
                borderRadius: 20, whiteSpace: "nowrap",
              }}>
                {account.headcount} employees
              </span>
            )}
            {account.hq && account.hq !== "Unknown" && (
              <span style={{
                fontSize: 11, color: "rgba(255,255,255,0.7)",
                background: "rgba(255,255,255,0.08)", padding: "2px 8px",
                borderRadius: 20, whiteSpace: "nowrap",
              }}>
                {account.hq}
              </span>
            )}
            {account.industry && account.industry !== "unknown" && (
              <span style={{
                fontSize: 11, color: "rgba(255,255,255,0.7)",
                background: "rgba(255,255,255,0.08)", padding: "2px 8px",
                borderRadius: 20, whiteSpace: "nowrap",
              }}>
                {account.industry}
              </span>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 16 }}>
          {[
            { label: "Leads", val: leads.length },
            { label: "Sent", val: sent },
            { label: "Replied", val: replied },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ color: A.white, fontWeight: 700, fontSize: 18 }}>{val}</div>
              <div style={{ color: A.textMuted, fontSize: 11 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Research fields */}
      <div style={{
        flex: 1, overflowY: "auto", padding: 16,
        background: A.white, border: `1px solid ${A.satellite}`,
        borderTop: "none", borderRadius: "0 0 8px 8px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>

        {/* Research fields */}
        {[
          { key: "webResearch", label: "Web Research" },
          { key: "edgarData", label: "SEC EDGAR" },
          { key: "jobSignals", label: "Job Signals" },
          { key: "accountNotes", label: "Account Notes" },
        ].map(({ key, label }) => (
          <div key={key}>
            <label style={lbl}>{label}</label>
            <textarea style={ta} value={fields[key]} onChange={setField(key)} placeholder={`Notes on ${label.toLowerCase()}…`} />
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 11, color: A.textMuted }}>
            {refreshing ? "Refreshing…" : (researchAge(webResearchAt) ?? "Not yet researched")}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" small onClick={refreshResearch} disabled={refreshing || saving}>
              {refreshing ? "Refreshing…" : "Refresh research"}
            </Btn>
            <Btn variant="primary" small onClick={save} disabled={saving || refreshing}>
              {saved ? "Saved ✓" : saving ? "Saving…" : "Save research"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
