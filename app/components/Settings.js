"use client";
import { useState, useEffect } from "react";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";

const DEFAULT_S1 = [
  "Pages visited on apollographql.com → infer interests and pain points from URL paths",
  "LinkedIn profile → recent posts, job changes, shared articles, activity signals",
  "Company news → funding, product launches, leadership hires, press coverage (last 90 days)",
  "Industry trends → recent sector developments relevant to this person's role",
  "Web search → public talks, podcasts, interviews, or content by prospect or company",
];

const DEFAULT_S2 = [
  "SEC EDGAR → recent 10-K, 10-Q, or 8-K filings for public companies",
  "Seeking Alpha → earnings call transcripts and analyst commentary",
  "Review original email sent → identify new angles, updated context, additional value-adds",
];

function EditableList({ items, onChange }) {
  const [newItem, setNewItem] = useState("");

  function remove(i) { onChange(items.filter((_, idx) => idx !== i)); }
  function add() {
    if (!newItem.trim()) return;
    onChange([...items, newItem.trim()]);
    setNewItem("");
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
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Add rule…"
          style={{
            flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 13,
            border: `1px solid ${A.satellite}`, background: A.white, outline: "none",
          }}
        />
        <Btn variant="secondary" small onClick={add}>Add</Btn>
      </div>
    </div>
  );
}

function LocalEditableList({ items, onChange }) {
  const [newItem, setNewItem] = useState("");
  function remove(i) { onChange(items.filter((_, idx) => idx !== i)); }
  function add() {
    if (!newItem.trim()) return;
    onChange([...items, newItem.trim()]);
    setNewItem("");
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
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Add item…"
          style={{
            flex: 1, padding: "8px 10px", borderRadius: 6, fontSize: 13,
            border: `1px solid ${A.satellite}`, background: A.white, outline: "none",
          }}
        />
        <Btn variant="secondary" small onClick={add}>Add</Btn>
      </div>
    </div>
  );
}

const SECTION_LABEL = {
  fontSize: 11, fontWeight: 700, color: A.textMuted, textTransform: "uppercase", marginBottom: 8,
};

export default function Settings() {
  const [rules, setRules] = useState([]);
  const [warnAt, setWarnAt] = useState(20);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);

  const [s1, setS1] = useState(DEFAULT_S1);
  const [s2, setS2] = useState(DEFAULT_S2);

  // Load rules from API on mount
  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(data => {
        setRules(data.rules ?? []);
        setWarnAt(data.warnAt ?? 20);
      })
      .catch(() => {})
      .finally(() => setRulesLoading(false));
  }, []);

  // Load s1/s2 from localStorage
  useEffect(() => {
    try {
      const s1s = localStorage.getItem("voyager_s1");
      const s2s = localStorage.getItem("voyager_s2");
      if (s1s) setS1(JSON.parse(s1s));
      if (s2s) setS2(JSON.parse(s2s));
    } catch {}
  }, []);

  async function saveRules(newRules) {
    setRules(newRules);
    setRulesSaving(true);
    setRulesSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: newRules }),
      });
      const data = await res.json();
      setRules(data.rules ?? newRules);
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 2000);
    } catch {} finally {
      setRulesSaving(false);
    }
  }

  function saveLocal(key, value, setter) {
    setter(value);
    localStorage.setItem(key, JSON.stringify(value));
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Writing Rules — DB-backed, injected into every generate call */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={SECTION_LABEL}>Writing Rules</div>
          <div style={{ flex: 1 }} />
          {rulesSaving && <span style={{ fontSize: 12, color: A.textMuted }}>Saving…</span>}
          {rulesSaved && <span style={{ fontSize: 12, color: "#16a34a" }}>Saved ✓</span>}
          <span style={{ fontSize: 12, color: A.textMuted }}>{rules.length}</span>
        </div>
        {rules.length >= warnAt && (
          <div style={{
            fontSize: 12, color: "#92400e", background: "#fef3c7",
            border: "1px solid #fcd34d", borderRadius: 6,
            padding: "6px 10px", marginBottom: 10,
          }}>
            {rules.length} rules — watch generation time. If drafts start taking longer, trim rules that overlap or rarely apply.
          </div>
        )}
        <div style={{ color: A.textMuted, fontSize: 12, marginBottom: 12 }}>
          Injected into every email generation prompt. Changes take effect on the next generate.
        </div>
        {rulesLoading ? (
          <div style={{ color: A.textMuted, fontSize: 13 }}>Loading…</div>
        ) : (
          <EditableList items={rules} onChange={saveRules} />
        )}
      </div>

      {/* Research Areas — localStorage */}
      <div>
        <div style={SECTION_LABEL}>Research Areas — Initial Outreach</div>
        <div style={{ color: A.textMuted, fontSize: 12, marginBottom: 12 }}>
          Signals Claude looks for when generating an initial email.
        </div>
        <LocalEditableList items={s1} onChange={v => saveLocal("voyager_s1", v, setS1)} />
      </div>
      <div>
        <div style={SECTION_LABEL}>Research Areas — Follow-up</div>
        <div style={{ color: A.textMuted, fontSize: 12, marginBottom: 12 }}>
          Additional sources used when generating a follow-up email.
        </div>
        <LocalEditableList items={s2} onChange={v => saveLocal("voyager_s2", v, setS2)} />
      </div>
    </div>
  );
}
