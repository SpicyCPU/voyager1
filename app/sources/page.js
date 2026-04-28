"use client";
import AppShell from "../components/AppShell";
import { A } from "../components/ui/palette";
import { DATA_SOURCES, STATUS_META, sourcesByCategory } from "../../lib/data-sources";

const CATEGORY_LABELS = {
  ingest:      { label: "Ingest Sources",     description: "Create or update leads — people enter the queue from here" },
  research:    { label: "Research Sources",    description: "Claude searches these during account research generation" },
  enrichment:  { label: "Enrichment Sources",  description: "Add context to existing leads and accounts" },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status, color: A.textMuted };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, color: meta.color,
      background: meta.color + "18",
      padding: "2px 8px", borderRadius: 20,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: meta.color, display: "inline-block", flexShrink: 0,
      }} />
      {meta.label}
    </span>
  );
}

function SignalRow({ signal }) {
  return (
    <div style={{
      marginLeft: 16, padding: "10px 12px",
      borderLeft: `2px solid ${A.satelliteLight}`,
      marginBottom: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: A.text }}>{signal.name}</span>
        <StatusBadge status={signal.status} />
      </div>
      <div style={{ fontSize: 12, color: A.textMuted, lineHeight: 1.5 }}>{signal.handling}</div>
    </div>
  );
}

function SourceCard({ source }) {
  return (
    <div style={{
      background: A.white, border: `1px solid ${A.satellite}`,
      borderRadius: 10, padding: 18, marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: A.text, marginBottom: 4 }}>
            {source.name}
          </div>
          <StatusBadge status={source.status} />
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600, color: A.textMuted,
          textTransform: "uppercase", letterSpacing: "0.05em",
          background: A.offWhite, padding: "2px 6px", borderRadius: 4,
          flexShrink: 0,
        }}>
          {source.category}
        </span>
      </div>

      {/* Details grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {source.delivery && (
          <Row label="Delivery" value={source.delivery} />
        )}
        {source.schedule && (
          <Row label="Schedule" value={source.schedule} />
        )}
        {source.filters && (
          <Row label="Filters" value={source.filters} />
        )}
        {source.fields && source.fields.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: A.textMuted, width: 72, flexShrink: 0, paddingTop: 2 }}>
              Fields
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {source.fields.map(f => (
                <span key={f} style={{
                  fontSize: 11, background: A.horizonFaint, color: A.horizonDark,
                  padding: "1px 6px", borderRadius: 4,
                }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
        {source.notes && (
          <Row label="Notes" value={source.notes} muted />
        )}
      </div>

      {/* Common Room signal breakdown */}
      {source.signals && source.signals.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: A.textMuted,
            textTransform: "uppercase", letterSpacing: "0.05em",
            marginBottom: 8,
          }}>
            Signal types
          </div>
          {source.signals.map(s => <SignalRow key={s.id} signal={s} />)}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: A.textMuted, width: 72, flexShrink: 0, paddingTop: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: muted ? A.textMuted : A.text, lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  );
}

function CategorySection({ category }) {
  const meta = CATEGORY_LABELS[category];
  const sources = sourcesByCategory(category);
  if (!sources.length) return null;

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: A.nebula, marginBottom: 4 }}>
          {meta.label}
        </div>
        <div style={{ fontSize: 12, color: A.textMuted }}>{meta.description}</div>
      </div>
      {sources.map(s => <SourceCard key={s.id} source={s} />)}
    </div>
  );
}

export default function SourcesPage() {
  const liveSources = DATA_SOURCES.filter(s => s.status === "live").length;
  const wiredSources = DATA_SOURCES.filter(s => s.status === "wired_not_connected").length;
  const plannedSources = DATA_SOURCES.filter(s => ["planned", "partial"].includes(s.status)).length;
  const deprecatedSources = DATA_SOURCES.filter(s => s.status === "deprecated").length;

  return (
    <AppShell>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: A.nebula, marginBottom: 6 }}>
            Data Sources
          </div>
          <div style={{ fontSize: 13, color: A.textMuted, marginBottom: 16 }}>
            Every system feeding Voyager 1 — what it provides, how it connects, and what's still planned.
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {[
              { label: "Live", count: liveSources, color: STATUS_META.live.color },
              { label: "Wired, not connected", count: wiredSources, color: STATUS_META.wired_not_connected.color },
              { label: "Planned", count: plannedSources, color: STATUS_META.planned.color },
              { label: "Deprecated", count: deprecatedSources, color: STATUS_META.deprecated.color },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: A.textMuted }}>
                  <span style={{ fontWeight: 700, color: A.text }}>{count}</span> {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <CategorySection category="ingest" />
        <CategorySection category="research" />
        <CategorySection category="enrichment" />
      </div>
    </AppShell>
  );
}
