"use client";
import { useEffect, useState } from "react";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";

const SIGNAL_TYPES = [
  { value: "manual_entry", label: "Manual entry" },
  { value: "web_visit", label: "Web page visit" },
  { value: "webinar", label: "Webinar" },
  { value: "job_posting", label: "Job posting" },
  { value: "other", label: "Other" },
];

const inp = (extra = {}) => ({
  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
  border: `1px solid ${A.satellite}`, background: A.white,
  outline: "none", color: A.text, ...extra,
});

const lbl = { fontSize: 11, fontWeight: 600, color: A.textMuted, textTransform: "uppercase", marginBottom: 4, display: "block" };

export default function ProspectForm({ onClose, onAdded, defaultCompany = "", editLead = null }) {
  const [accounts, setAccounts] = useState([]);
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [form, setForm] = useState({
    name: editLead?.name ?? "",
    title: editLead?.title ?? "",
    company: editLead?.account?.company ?? defaultCompany,
    email: editLead?.email ?? "",
    linkedinUrl: editLead?.linkedinUrl ?? "",
    visitedUrls: editLead?.visitedUrls ?? "",
    extraContext: editLead?.extraContext ?? "",
    signalType: editLead?.signalType ?? "manual_entry",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/accounts").then(r => r.json()).then(d => setAccounts(d.accounts ?? []));
  }, []);

  useEffect(() => {
    if (!form.company.trim()) { setCompanySuggestions([]); return; }
    const q = form.company.toLowerCase();
    setCompanySuggestions(accounts.filter(a => a.company.toLowerCase().includes(q)).slice(0, 5));
  }, [form.company, accounts]);

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }

  const matchedAccount = accounts.find(a => a.company.toLowerCase() === form.company.trim().toLowerCase());
  const priorCount = matchedAccount?._count?.leads ?? 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.company.trim()) { setError("Name and company are required."); return; }
    setSaving(true); setError("");
    try {
      let res, data;
      if (editLead) {
        res = await fetch(`/api/leads/${editLead.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
        });
        data = await res.json();
        onAdded?.(data.lead);
      } else {
        res = await fetch("/api/leads", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
        });
        data = await res.json();
        onAdded?.(data.lead);
      }
      if (!res.ok) throw new Error(data.error ?? "Request failed");
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40,
      }} />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 480,
        background: A.white, zIndex: 50, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 24px", borderBottom: `1px solid ${A.satelliteLight}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{editLead ? "Edit lead" : "New lead"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: A.textMuted }}>✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Name *</label>
              <input style={inp()} value={form.name} onChange={set("name")} placeholder="Alex Johnson" />
            </div>
            <div>
              <label style={lbl}>Title</label>
              <input style={inp()} value={form.title} onChange={set("title")} placeholder="VP Engineering" />
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <label style={lbl}>Company *</label>
            <input
              style={inp()}
              value={form.company}
              onChange={set("company")}
              placeholder="Acme Corp"
              autoComplete="off"
            />
            {companySuggestions.length > 0 && form.company && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0,
                background: A.white, border: `1px solid ${A.satellite}`, borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 10, marginTop: 2,
              }}>
                {companySuggestions.map(a => (
                  <div
                    key={a.id}
                    onClick={() => { setForm(f => ({ ...f, company: a.company })); setCompanySuggestions([]); }}
                    style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, display: "flex", justifyContent: "space-between" }}
                    onMouseEnter={e => e.currentTarget.style.background = A.satelliteLight}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span>{a.company}</span>
                    <span style={{ color: A.textMuted, fontSize: 11 }}>{a._count?.leads ?? 0} leads</span>
                  </div>
                ))}
              </div>
            )}
            {matchedAccount && priorCount > 0 && (
              <div style={{ marginTop: 4, fontSize: 11, color: A.horizon }}>
                {priorCount} prior lead{priorCount !== 1 ? "s" : ""} at {matchedAccount.company}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Email</label>
              <input style={inp()} value={form.email} onChange={set("email")} type="email" placeholder="alex@acme.com" />
            </div>
            <div>
              <label style={lbl}>Signal type</label>
              <select style={inp()} value={form.signalType} onChange={set("signalType")}>
                {SIGNAL_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={lbl}>LinkedIn URL</label>
            <input style={inp({ fontFamily: "monospace", fontSize: 12 })} value={form.linkedinUrl} onChange={set("linkedinUrl")} placeholder="https://linkedin.com/in/..." />
          </div>

          <div>
            <label style={lbl}>Pages visited</label>
            <textarea
              style={inp({ minHeight: 80, fontFamily: "monospace", fontSize: 12 })}
              value={form.visitedUrls}
              onChange={set("visitedUrls")}
              placeholder={"https://apollographql.com/docs/router\nhttps://apollographql.com/blog/..."}
            />
          </div>

          <div>
            <label style={lbl}>Extra context</label>
            <textarea
              style={inp({ minHeight: 80 })}
              value={form.extraContext}
              onChange={set("extraContext")}
              placeholder="Any additional context about this prospect…"
            />
          </div>

          {error && <div style={{ color: "#dc2626", fontSize: 12, padding: "8px 12px", background: "#fee2e2", borderRadius: 6 }}>{error}</div>}
        </form>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: `1px solid ${A.satelliteLight}`,
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editLead ? "Save changes" : "Add lead"}
          </Btn>
        </div>
      </div>
    </>
  );
}
