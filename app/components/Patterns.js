"use client";
import { useState, useEffect } from "react";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(n, total) {
  if (!total) return "—";
  return Math.round((n / total) * 100) + "%";
}

// ── Primitives ───────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
      color: A.textMuted, textTransform: "uppercase", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function BigStat({ value, label, sub, color }) {
  return (
    <div style={{
      background: A.white, border: `1px solid ${A.satellite}`,
      borderRadius: 8, padding: "14px 18px", flex: 1, minWidth: 100,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? A.text, lineHeight: 1 }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 12, color: A.textMuted, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: A.satellite, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, count, total, color }) {
  const w = total ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
      <div style={{ width: 130, fontSize: 12, color: A.text, flexShrink: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>
        {label}
      </div>
      <div style={{ flex: 1, height: 6, background: A.satelliteLight, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color ?? A.horizon, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
      <div style={{ width: 32, textAlign: "right", fontSize: 12, fontWeight: 600, color: A.text, flexShrink: 0 }}>
        {count}
      </div>
      <div style={{ width: 36, textAlign: "right", fontSize: 11, color: A.textMuted, flexShrink: 0 }}>
        {pct(count, total)}
      </div>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: A.white, border: `1px solid ${A.satellite}`,
      borderRadius: 8, padding: "18px 20px",
      ...style,
    }}>
      {children}
    </div>
  );
}

const SIGNAL_LABELS = {
  platform_signup: "Studio Sign-up",
  web_visit: "Web Visit",
  webinar: "Webinar",
  job_posting: "Job Signal",
  github_download: "GitHub Download",
  manual_entry: "Manual Entry",
  customer_expansion: "Expansion",
  other: "Other",
};

const TIER_COLORS = {
  FREE: A.satellite,
  "FREE_PLAN": A.satellite,
  DEVELOPER: "#2563eb",
  TEAM: "#16a34a",
  ENTERPRISE: A.nebula,
  BUSINESS: A.nebula,
  BUSINESS_PLUS: A.nebula,
};

// ── Main component ───────────────────────────────────────────────────────────

export default function Patterns() {
  const [stats, setStats] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [error, setError] = useState(null);
  const [narrativeError, setNarrativeError] = useState(null);

  // Load stats on mount
  useEffect(() => {
    fetch("/api/insights")
      .then(r => r.json())
      .then(data => {
        setStats(data.stats);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingStats(false));
  }, []);

  async function generateBriefing() {
    setLoadingNarrative(true);
    setNarrativeError(null);
    try {
      const res = await fetch("/api/insights?analyze=true");
      const data = await res.json();
      if (data.narrative) setNarrative(data.narrative);
      if (data.narrativeError) setNarrativeError(data.narrativeError);
      // Refresh stats too
      if (data.stats) setStats(data.stats);
    } catch (e) {
      setNarrativeError(e.message);
    } finally {
      setLoadingNarrative(false);
    }
  }

  if (loadingStats) {
    return (
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px", color: A.textMuted, fontSize: 13 }}>
        Loading pipeline data…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fff1f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13 }}>
          {error}
        </div>
      </div>
    );
  }

  const s = stats;
  const totalActive = s?.funnel.total ?? 0;
  const totalSignals = s?.ingest.signals.reduce((sum, [, v]) => sum + v, 0) ?? 0;
  const totalTiers = s?.leadProfile.tiers.reduce((sum, [, v]) => sum + v, 0) ?? 0;
  const { personal = 0, corporate = 0, unknown: noEmail = 0 } = s?.leadProfile.emailTypes ?? {};
  const totalEmails = personal + corporate + noEmail;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 24px" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: A.text, marginBottom: 4 }}>
          Lead Flow
        </div>
        <div style={{ fontSize: 13, color: A.textMuted }}>
          Live snapshot of what's coming in, where it's going, and what the mix looks like.
        </div>
      </div>

      {/* ── Funnel ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel>Pipeline funnel</SectionLabel>
        <div style={{ display: "flex", gap: 10 }}>
          <BigStat value={s?.funnel.total} label="Total active" />
          <BigStat value={s?.funnel.inQueue} label="In queue" sub="unworked" color={A.textMuted} />
          <BigStat value={s?.funnel.generated} label="Draft ready" color="#2563eb" />
          <BigStat value={s?.funnel.sent} label="Sent" color="#16a34a" />
          <BigStat value={s?.funnel.replied} label="Replied" color={A.horizon} />
          <BigStat value={s?.funnel.discarded} label="Discarded" sub="all time" color={A.satellite} />
        </div>
      </div>

      {/* ── Two-column: Signal sources + Tier mix ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Signal sources */}
        <Card>
          <SectionLabel>Signal sources</SectionLabel>
          <div style={{ marginBottom: 10, fontSize: 12, color: A.textMuted }}>
            {s?.ingest.last7d ?? 0} in last 7 days &nbsp;·&nbsp; {s?.ingest.last30d ?? 0} in last 30 days
          </div>
          {(s?.ingest.signals ?? []).map(([key, count]) => (
            <BarRow
              key={key}
              label={SIGNAL_LABELS[key] ?? key.replace(/_/g, " ")}
              count={count}
              total={totalSignals}
              color={A.horizon}
            />
          ))}
          {!s?.ingest.signals?.length && (
            <div style={{ fontSize: 12, color: A.textMuted }}>No signal data yet</div>
          )}
        </Card>

        {/* Tier mix */}
        <Card>
          <SectionLabel>Plan tier mix</SectionLabel>
          {(s?.leadProfile.tiers ?? []).map(([tier, count]) => (
            <BarRow
              key={tier}
              label={tier === "unknown" ? "No tier data" : tier}
              count={count}
              total={totalTiers}
              color={TIER_COLORS[tier] ?? A.textMuted}
            />
          ))}
          {!s?.leadProfile.tiers?.length && (
            <div style={{ fontSize: 12, color: A.textMuted }}>No tier data yet</div>
          )}
        </Card>
      </div>

      {/* ── Two-column: Email type + Special types ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* Email type */}
        <Card>
          <SectionLabel>Email type</SectionLabel>
          <BarRow label="Corporate" count={corporate} total={totalEmails} color="#2563eb" />
          <BarRow label="Personal (gmail etc.)" count={personal} total={totalEmails} color={A.textMuted} />
          {noEmail > 0 && <BarRow label="No email" count={noEmail} total={totalEmails} color={A.satelliteLight} />}
          {personal > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: A.textMuted, lineHeight: 1.5 }}>
              {s?.leadProfile.special.githubEnriched ?? 0} of {personal} personal-email leads de-anonymized via GitHub
              {" "}({pct(s?.leadProfile.special.githubEnriched ?? 0, personal)})
            </div>
          )}
        </Card>

        {/* Special types */}
        <Card>
          <SectionLabel>Lead flags</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <FlagRow
              label="Consultancy / SI"
              count={s?.leadProfile.special.si ?? 0}
              total={totalActive}
              color="#7c3aed"
              badge="SI"
              badgeStyle={{ color: "#6b21a8", background: "#f3e8ff", border: "1px solid #d8b4fe" }}
              note="Generic email, client-build framing"
            />
            <FlagRow
              label="India-based"
              count={s?.leadProfile.special.india ?? 0}
              total={totalActive}
              color="#1d4ed8"
              badge="IN"
              badgeStyle={{ color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe" }}
              note="Adoption email, tier upgrade angle"
            />
            <FlagRow
              label="Paid-org warning"
              count={s?.leadProfile.special.paidOrgWarning ?? 0}
              total={totalActive}
              color="#b45309"
              badge="⚠️"
              badgeStyle={{ color: "#b45309", background: "#fef3c7", border: "1px solid #fde68a" }}
              note="Verify before outreach"
            />
          </div>
        </Card>
      </div>

      {/* ── Industries ── */}
      {s?.topIndustries?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Card>
            <SectionLabel>Top industries</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              {s.topIndustries.map(([industry, count]) => (
                <BarRow
                  key={industry}
                  label={industry}
                  count={count}
                  total={allAccounts}
                  color={A.nebula}
                />
              ))}
            </div>
            <div style={{ fontSize: 11, color: A.textMuted, marginTop: 8 }}>
              Based on accounts with industry metadata
            </div>
          </Card>
        </div>
      )}

      {/* ── Discard breakdown ── */}
      {s?.discard?.bySignal?.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <Card>
            <SectionLabel>Discarded leads by signal type</SectionLabel>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {s.discard.bySignal.map(([key, count]) => (
                <div key={key} style={{ fontSize: 12, color: A.textMuted }}>
                  <span style={{ fontWeight: 600, color: A.text }}>{count}</span>{" "}
                  {SIGNAL_LABELS[key] ?? key.replace(/_/g, " ")}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── AI Briefing ── */}
      <div style={{ borderTop: `1px solid ${A.satellite}`, paddingTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: A.text }}>AI Pipeline Briefing</div>
            <div style={{ fontSize: 12, color: A.textMuted }}>
              Claude reads the above data and tells you what to pay attention to.
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Btn variant="secondary" onClick={generateBriefing} disabled={loadingNarrative}>
            {loadingNarrative ? "Analyzing…" : narrative ? "Refresh" : "Generate Briefing"}
          </Btn>
        </div>

        {loadingNarrative && (
          <div style={{
            padding: "20px", borderRadius: 8,
            background: A.white, border: `1px solid ${A.satellite}`,
            color: A.textMuted, fontSize: 13, display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%",
              border: `2px solid ${A.horizon}`, borderTopColor: "transparent",
              animation: "spin 0.8s linear infinite", flexShrink: 0,
            }} />
            Reading your pipeline…
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {narrativeError && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fff1f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12 }}>
            {narrativeError}
          </div>
        )}

        {narrative && !loadingNarrative && (
          <div style={{
            background: A.white, border: `1px solid ${A.satellite}`,
            borderRadius: 8, padding: "20px 24px",
          }}>
            {narrative.split("\n\n").filter(Boolean).map((para, i) => (
              <p key={i} style={{ fontSize: 14, lineHeight: 1.75, color: A.text, margin: 0, marginBottom: 14 }}>
                {para.trim()}
              </p>
            ))}
          </div>
        )}

        {!narrative && !loadingNarrative && !narrativeError && (
          <div style={{
            padding: "28px 20px", textAlign: "center",
            background: A.white, border: `1px dashed ${A.satellite}`,
            borderRadius: 8, color: A.textMuted, fontSize: 13,
          }}>
            Click "Generate Briefing" to get Claude's read on what's in your pipeline and where to focus.
          </div>
        )}
      </div>
    </div>
  );
}

// ── FlagRow ───────────────────────────────────────────────────────────────────

function FlagRow({ label, count, total, badge, badgeStyle, note }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
        flexShrink: 0, marginTop: 1, ...badgeStyle,
      }}>
        {badge}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: A.text }}>{count}</span>
          <span style={{ fontSize: 12, color: A.textMuted }}>{label}</span>
          <span style={{ fontSize: 11, color: A.satellite }}>({pct(count, total)})</span>
        </div>
        <div style={{ fontSize: 11, color: A.textMuted }}>{note}</div>
      </div>
    </div>
  );
}
