"use client";
import { useState, useEffect } from "react";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";

const SECTION_LABEL = {
  fontSize: 11, fontWeight: 700, color: A.textMuted,
  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
};

const ta = (extra = {}) => ({
  width: "100%", padding: "10px 12px", borderRadius: 6, fontSize: 13,
  border: `1px solid ${A.satellite}`, background: A.white,
  outline: "none", color: A.text, lineHeight: 1.6,
  resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
  ...extra,
});

// ── Editable list (writing rules) ─────────────────────────────────────────────

function EditableList({ items, onChange }) {
  const [draft, setDraft] = useState("");
  function remove(i) { onChange(items.filter((_, idx) => idx !== i)); }
  function add() {
    if (!draft.trim()) return;
    onChange([...items, draft.trim()]);
    setDraft("");
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{
            flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 13,
            background: A.white, border: `1px solid ${A.satellite}`, color: A.text, lineHeight: 1.4,
          }}>{item}</div>
          <button onClick={() => remove(i)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: A.textMuted, fontSize: 16, padding: "6px 4px", flexShrink: 0,
          }}>✕</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Add rule…"
          style={{ flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 13, border: `1px solid ${A.satellite}`, background: A.white, outline: "none" }}
        />
        <Btn variant="secondary" small onClick={add}>Add</Btn>
      </div>
    </div>
  );
}

// ── Autosave textarea ─────────────────────────────────────────────────────────

function AutoSaveTextarea({ value, onChange, onSave, placeholder, minHeight = 120 }) {
  const [local, setLocal] = useState(value ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setLocal(value ?? ""); setDirty(false); }, [value]);

  function handleChange(e) { setLocal(e.target.value); setDirty(true); }
  function handleBlur() { if (dirty) { onSave(local); setDirty(false); } }

  return (
    <textarea
      value={local}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      style={ta({ minHeight })}
    />
  );
}

// ── Refinement memory viewer ───────────────────────────────────────────────────

function RefinementMemory() {
  const [examples, setExamples] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/refinement-examples")
      .then(r => r.json())
      .then(data => setExamples(data.examples ?? []))
      .catch(() => setExamples([]))
      .finally(() => setLoading(false));
  }, []);

  async function deleteExample(id) {
    await fetch(`/api/refinement-examples/${id}`, { method: "DELETE" }).catch(() => {});
    setExamples(prev => prev.filter(e => e.id !== id));
  }

  if (loading) return <div style={{ fontSize: 13, color: A.textMuted }}>Loading memory…</div>;
  if (!examples?.length) return (
    <div style={{ fontSize: 13, color: A.textMuted }}>
      No refinements stored yet. When you give feedback and refine a draft, the before/after gets saved here and used to tune future generations.
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {examples.map(ex => (
        <div key={ex.id} style={{
          padding: "10px 12px", borderRadius: 6,
          background: A.white, border: `1px solid ${A.satellite}`,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: A.textMuted, textTransform: "uppercase", marginBottom: 4 }}>
                {ex.field === "emailDraft" ? "Email" : "LinkedIn"} — feedback
              </div>
              <div style={{ fontSize: 13, color: A.text, marginBottom: 8, fontStyle: "italic" }}>
                "{ex.feedback}"
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: A.textMuted, textTransform: "uppercase", marginBottom: 3 }}>Before</div>
                  <div style={{ fontSize: 12, color: A.textMuted, lineHeight: 1.5, borderLeft: `2px solid ${A.satellite}`, paddingLeft: 8 }}>
                    {ex.before?.slice(0, 200)}{ex.before?.length > 200 ? "…" : ""}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", marginBottom: 3 }}>After</div>
                  <div style={{ fontSize: 12, color: A.text, lineHeight: 1.5, borderLeft: `2px solid #bbf7d0`, paddingLeft: 8 }}>
                    {ex.after?.slice(0, 200)}{ex.after?.length > 200 ? "…" : ""}
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => deleteExample(ex.id)}
              title="Remove from memory"
              style={{ background: "none", border: "none", cursor: "pointer", color: A.textMuted, fontSize: 16, padding: "2px 4px", flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = "#dc2626"}
              onMouseLeave={e => e.currentTarget.style.color = A.textMuted}
            >✕</button>
          </div>
          <div style={{ fontSize: 11, color: A.satellite, marginTop: 6 }}>
            {new Date(ex.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [rules, setRules] = useState([]);
  const [emailStrategy, setEmailStrategy] = useState("");
  const [researchFocus, setResearchFocus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(data => {
        setRules(data.rules ?? []);
        setEmailStrategy(data.emailStrategy ?? "");
        setResearchFocus(data.researchFocus ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(updates) {
    setSaving(true); setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.rules) setRules(data.rules);
      if (data.emailStrategy !== undefined) setEmailStrategy(data.emailStrategy);
      if (data.researchFocus !== undefined) setResearchFocus(data.researchFocus);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div style={{ padding: 24, color: A.textMuted, fontSize: 13 }}>Loading settings…</div>
  );

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 36 }}>

      {/* Save indicator */}
      <div style={{ position: "fixed", top: 60, right: 24, zIndex: 10, pointerEvents: "none" }}>
        {saving && <span style={{ fontSize: 12, color: A.textMuted, background: A.white, padding: "4px 10px", borderRadius: 20, border: `1px solid ${A.satellite}` }}>Saving…</span>}
        {saved && <span style={{ fontSize: 12, color: "#16a34a", background: "#f0fdf4", padding: "4px 10px", borderRadius: 20, border: "1px solid #bbf7d0" }}>Saved ✓</span>}
      </div>

      {/* ── Email Strategy ── */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <div style={SECTION_LABEL}>Email Strategy</div>
          <div style={{ fontSize: 12, color: A.textMuted, marginTop: 2 }}>
            High-level guidance injected into every email generation. Define the goal, the prospect mindset, and what makes a good email for this motion.
          </div>
        </div>
        <AutoSaveTextarea
          value={emailStrategy}
          onSave={v => save({ emailStrategy: v })}
          placeholder="e.g. Goal: book a 20-minute intro call. These leads signed up for GraphOS — they have real intent. The email should demonstrate you understand their specific situation..."
          minHeight={140}
        />
      </div>

      {/* ── Research Focus ── */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <div style={SECTION_LABEL}>Research Focus</div>
          <div style={{ fontSize: 12, color: A.textMuted, marginTop: 2 }}>
            What Claude should prioritize when searching for company and prospect intel. Changes what the research step looks for.
          </div>
        </div>
        <AutoSaveTextarea
          value={researchFocus}
          onSave={v => save({ researchFocus: v })}
          placeholder="e.g. Priority: engineering blog posts, job postings mentioning GraphQL, recent funding, earnings call quotes about API strategy..."
          minHeight={140}
        />
      </div>

      {/* ── Writing Rules ── */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={SECTION_LABEL}>Writing Rules</div>
            <span style={{ fontSize: 11, color: A.textMuted }}>{rules.length} rules</span>
            {rules.length >= 20 && (
              <span style={{ fontSize: 11, color: "#92400e", background: "#fef3c7", padding: "1px 6px", borderRadius: 4 }}>
                Getting long — trim rules that overlap
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: A.textMuted, marginTop: 2 }}>
            Style and tone rules injected into every draft. Changes take effect immediately on the next generation.
          </div>
        </div>
        <EditableList items={rules} onChange={newRules => save({ rules: newRules })} />
      </div>

      {/* ── Refinement Memory ── */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <div style={SECTION_LABEL}>Refinement Memory</div>
          <div style={{ fontSize: 12, color: A.textMuted, marginTop: 2 }}>
            Every time you give feedback and refine a draft, the before/after is stored here. Claude injects the 5 most recent examples into every new generation to learn your voice and preferences. Delete examples that represent a one-off correction rather than a recurring preference.
          </div>
        </div>
        <RefinementMemory />
      </div>

    </div>
  );
}
