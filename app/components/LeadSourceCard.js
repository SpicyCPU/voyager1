"use client";
import { useState } from "react";
import { A } from "./ui/palette";

const SIGNAL_LABELS = {
  webinar:             "Webinar",
  web_visit:           "Web visit",
  job_posting:         "Job posting",
  customer_expansion:  "Expansion signal",
  github_download:     "GitHub download",
  platform_signup:     "Studio sign-up",
  manual_entry:        "Manual entry",
  other:               "Signal",
};

function timeAgo(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor(diff / 60000);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname + (u.search || "");
    return path.length > 60 ? path.slice(0, 57) + "…" : path;
  } catch {
    return url.length > 60 ? url.slice(0, 57) + "…" : url;
  }
}

// Pull "Tier: X" out of the dot-separated extraContext string
function extractTier(extraContext) {
  if (!extraContext) return null;
  const match = extraContext.match(/Tier:\s*([^·\n]+)/);
  return match ? match[1].trim() : null;
}

const TIER_COLORS = {
  free:       { bg: "#f1f5f9", color: "#475569" },
  developer:  { bg: "#eff6ff", color: "#1d4ed8" },
  standard:   { bg: "#f0fdf4", color: "#15803d" },
  enterprise: { bg: "#fdf4ff", color: "#7e22ce" },
};

function TierBadge({ tier }) {
  const key = tier.toLowerCase();
  const { bg, color } = TIER_COLORS[key] ?? { bg: A.offWhite, color: A.textMuted };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 7px",
      borderRadius: 20, background: bg, color,
    }}>
      {tier}
    </span>
  );
}

export default function LeadSourceCard({ lead }) {
  const [expanded, setExpanded] = useState(false);

  const visitedUrls = lead.visitedUrls
    ? lead.visitedUrls.split(/[\n,]+/).map(u => u.trim()).filter(Boolean)
    : [];

  let signalHistory = [];
  try {
    if (lead.signalHistory) signalHistory = JSON.parse(lead.signalHistory);
  } catch {}

  const tier = extractTier(lead.extraContext);
  const hasDetails = visitedUrls.length > 0 || signalHistory.length > 1 || lead.extraContext;
  const showToggle = hasDetails;

  const urlsToShow = expanded ? visitedUrls : visitedUrls.slice(0, 2);
  const hiddenUrls = visitedUrls.length - 2;

  return (
    <div style={{
      background: A.white, border: `1px solid ${A.satellite}`,
      borderRadius: 8, overflow: "hidden",
    }}>
      {/* Header row — always visible */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        cursor: showToggle ? "pointer" : "default",
      }} onClick={() => showToggle && setExpanded(e => !e)}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Signal type */}
          <span style={{
            fontSize: 12, fontWeight: 700, color: A.horizonDark,
            background: A.horizonFaint, padding: "2px 8px", borderRadius: 20,
          }}>
            {SIGNAL_LABELS[lead.signalType] ?? lead.signalType?.replace(/_/g, " ") ?? "Signal"}
          </span>

          {/* Subscription tier (platform_signup only) */}
          {tier && (
            <span style={{ fontSize: 12, color: A.textMuted }}>
              {tier} plan
            </span>
          )}

          {/* Recency */}
          {lead.lastSignalAt && (
            <span style={{ fontSize: 12, color: A.textMuted }}>
              {timeAgo(lead.lastSignalAt)}
            </span>
          )}

          {/* Signal count if multiple */}
          {signalHistory.length > 1 && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: A.satellite,
              background: A.offWhite, padding: "2px 6px", borderRadius: 10,
            }}>
              {signalHistory.length} touches
            </span>
          )}

          {/* LinkedIn link */}
          {lead.linkedinUrl && (
            <a
              href={lead.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 12, color: "#0a66c2", textDecoration: "none", fontWeight: 500 }}
            >
              LinkedIn ↗
            </a>
          )}
        </div>

        {/* Expand toggle */}
        {showToggle && (
          <span style={{ fontSize: 11, color: A.textMuted, flexShrink: 0 }}>
            {expanded ? "▴" : "▾"}
          </span>
        )}
      </div>

      {/* Expanded detail section */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${A.satelliteLight}`,
          padding: "10px 14px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {/* Visited pages */}
          {visitedUrls.length > 0 && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: A.textMuted, textTransform: "uppercase",
                letterSpacing: "0.05em", marginBottom: 5,
              }}>
                Pages visited
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {urlsToShow.map((url, i) => (
                  <a
                    key={i}
                    href={url.startsWith("http") ? url : `https://${url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12, color: A.horizon, textDecoration: "none", fontFamily: "monospace",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                    title={url}
                  >
                    {truncateUrl(url)}
                  </a>
                ))}
                {!expanded && hiddenUrls > 0 && (
                  <span style={{ fontSize: 11, color: A.textMuted }}>+{hiddenUrls} more</span>
                )}
              </div>
            </div>
          )}

          {/* Signal history — multiple touchpoints */}
          {signalHistory.length > 1 && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: A.textMuted, textTransform: "uppercase",
                letterSpacing: "0.05em", marginBottom: 5,
              }}>
                Signal history
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {signalHistory.map((evt, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: A.horizonDark,
                      background: A.horizonFaint, padding: "1px 6px", borderRadius: 10,
                      flexShrink: 0,
                    }}>
                      {SIGNAL_LABELS[evt.type] ?? evt.type}
                    </span>
                    {evt.url && (
                      <span style={{
                        fontSize: 11, color: A.textMuted, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }} title={evt.url}>
                        {truncateUrl(evt.url)}
                      </span>
                    )}
                    {evt.timestamp && (
                      <span style={{ fontSize: 11, color: A.textMuted, flexShrink: 0 }}>
                        {timeAgo(evt.timestamp)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extra context */}
          {lead.extraContext && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: A.textMuted, textTransform: "uppercase",
                letterSpacing: "0.05em", marginBottom: 5,
              }}>
                Context
              </div>
              <div style={{ fontSize: 12, color: A.text, lineHeight: 1.5 }}>
                {lead.extraContext}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
