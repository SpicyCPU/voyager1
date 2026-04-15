"use client";
import { useState } from "react";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: A.white, border: `1px solid ${A.satellite}`,
      borderRadius: 8, padding: "14px 18px", minWidth: 120,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: A.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: A.textMuted, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: A.satellite, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function Patterns() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to analyze");
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const meta = result?.meta;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: A.text, marginBottom: 6 }}>
          Pipeline Patterns
        </div>
        <div style={{ fontSize: 13, color: A.textMuted }}>
          AI analysis of your pipeline — industry mix, outreach themes, and style insights from your edits.
        </div>
      </div>

      {/* Stats row — shown after first analysis */}
      {meta && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <StatCard label="Accounts" value={meta.totalAccounts} />
          <StatCard label="Active Leads" value={meta.activeLeads} />
          <StatCard label="Deleted" value={meta.deletedLeads} sub="qualification signal" />
          <StatCard label="Sent / Replied" value={meta.sentLeads} />
          <StatCard label="Refinements" value={meta.refinementCount} sub="style edits logged" />
          <StatCard
            label="w/ metadata"
            value={meta.accountsWithMetadata}
            sub={`of ${meta.totalAccounts} accounts`}
          />
        </div>
      )}

      {/* Analyze button */}
      <div style={{ marginBottom: 24 }}>
        <Btn
          variant="primary"
          onClick={analyze}
          disabled={loading}
        >
          {loading ? "Analyzing…" : result ? "Refresh Analysis" : "Analyze Patterns"}
        </Btn>
        {meta && (
          <span style={{ marginLeft: 12, fontSize: 12, color: A.textMuted }}>
            Last analyzed {new Date(meta.generatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: "12px 16px", borderRadius: 8,
          background: "#fff1f2", border: "1px solid #fecaca",
          color: "#991b1b", fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{
          padding: "24px 20px", borderRadius: 8,
          background: A.white, border: `1px solid ${A.satellite}`,
          color: A.textMuted, fontSize: 13, lineHeight: 1.7,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: "50%",
              border: `2px solid ${A.horizon}`,
              borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite",
            }} />
            Claude is analyzing your pipeline data…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Insights text */}
      {result?.insights && !loading && (
        <div style={{
          background: A.white, border: `1px solid ${A.satellite}`,
          borderRadius: 8, padding: "24px 28px",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            color: A.textMuted, textTransform: "uppercase", marginBottom: 16,
          }}>
            Intelligence Brief
          </div>
          {result.insights.split("\n\n").filter(Boolean).map((para, i) => (
            <p key={i} style={{
              fontSize: 14, lineHeight: 1.75, color: A.text,
              margin: 0, marginBottom: 16,
            }}>
              {para.trim()}
            </p>
          ))}
          {meta.accountsWithMetadata < Math.max(meta.totalAccounts * 0.5, 3) && (
            <div style={{
              marginTop: 16, padding: "10px 14px", borderRadius: 6,
              background: A.horizonFaint, border: `1px solid ${A.horizonLight}`,
              fontSize: 12, color: A.horizonDark,
            }}>
              Only {meta.accountsWithMetadata} of {meta.totalAccounts} accounts have industry/size metadata.
              Generate drafts for more leads to enrich this data automatically.
            </div>
          )}
        </div>
      )}

      {/* Empty state — before first analysis */}
      {!result && !loading && !error && (
        <div style={{
          padding: "40px 24px", textAlign: "center",
          background: A.white, border: `1px dashed ${A.satellite}`,
          borderRadius: 8, color: A.textMuted,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No analysis yet</div>
          <div style={{ fontSize: 13 }}>
            Click "Analyze Patterns" to get Claude's read on your pipeline —
            industry mix, outreach themes, and style patterns from your edits.
          </div>
        </div>
      )}
    </div>
  );
}
