"use client";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";
import ProspectForm from "./ProspectForm";
import SentView from "./SentView";
import Settings from "./Settings";
import Patterns from "./Patterns";

function LogoMark() {
  return (
    <div style={{ position: "relative", width: 28, height: 28, flexShrink: 0 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: A.horizon, display: "flex",
        alignItems: "center", justifyContent: "center",
        color: A.white, fontWeight: 800, fontSize: 14, letterSpacing: "-0.5px",
      }}>A</div>
      <div style={{
        position: "absolute", bottom: 1, right: 1,
        width: 7, height: 7, borderRadius: "50%",
        background: A.titan, border: `2px solid ${A.nebula}`,
      }} />
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "none", border: "none", cursor: "pointer",
      color: active ? A.horizon : A.satellite,
      fontWeight: active ? 600 : 400,
      fontSize: 13, padding: "4px 0",
      borderBottom: active ? `2px solid ${A.horizon}` : "2px solid transparent",
      transition: "all 0.12s",
    }}>
      {label}
    </button>
  );
}

export default function AppShell({ children, accountId }) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState("accounts");
  const [showForm, setShowForm] = useState(false);
  const [queueCount, setQueueCount] = useState(null);

  useEffect(() => {
    function fetchCount() {
      fetch("/api/queue")
        .then(r => r.json())
        .then(data => setQueueCount(data.total ?? 0))
        .catch(() => {});
    }
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, []);

  // Sync tab from pathname
  useEffect(() => {
    if (pathname === "/" || pathname.startsWith("/review")) setTab("review");
    else if (pathname.startsWith("/accounts")) setTab("accounts");
    else if (pathname.startsWith("/sources")) setTab("sources");
    // patterns/sent/settings are client-only tabs — no pathname sync needed
  }, [pathname]);

  const isReview = tab === "review";
  const isAccounts = tab === "accounts";
  const isSent = tab === "sent";
  const isSettings = tab === "settings";
  const isSources = tab === "sources";
  const isPatterns = tab === "patterns";

  function handleLeadAdded(lead) {
    setShowForm(false);
    router.push(`/accounts/${lead.account.id}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: A.offWhite, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{
        background: A.nebula, padding: "0 24px",
        display: "flex", alignItems: "center", gap: 16, height: 52,
        flexShrink: 0,
      }}>
        <LogoMark />
        <span style={{ color: A.white, fontWeight: 700, fontSize: 15, letterSpacing: "-0.3px" }}>
          Voyager 1
        </span>
        <div style={{ flex: 1 }} />
        <Btn variant="primary" small onClick={() => { setTab("accounts"); setShowForm(true); }}>
          + New Lead
        </Btn>
      </div>

      {/* Tab bar */}
      <div style={{
        background: A.nebula, borderBottom: `1px solid ${A.nebulaLight}`,
        padding: "0 24px", display: "flex", gap: 24,
      }}>
        <TabBtn
          label={queueCount ? `Review (${queueCount})` : "Review"}
          active={isReview}
          onClick={() => { setTab("review"); router.push("/"); }}
        />
        <TabBtn label="Accounts" active={isAccounts} onClick={() => { setTab("accounts"); router.push("/accounts"); }} />
        <TabBtn label="Sent" active={isSent} onClick={() => setTab("sent")} />
        <TabBtn label="Sources" active={isSources} onClick={() => { setTab("sources"); router.push("/sources"); }} />
        <TabBtn label="Insights" active={isPatterns} onClick={() => setTab("patterns")} />
        <TabBtn label="Settings" active={isSettings} onClick={() => setTab("settings")} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {(isReview || isAccounts || isSources) && children}
        {isSent && <SentView onSelectLead={(lead) => { setTab("accounts"); router.push(`/accounts/${lead.accountId}`); }} />}
        {isPatterns && <Patterns />}
        {isSettings && <Settings />}
      </div>

      {/* ProspectForm slide-over */}
      {showForm && (
        <ProspectForm
          onClose={() => setShowForm(false)}
          onAdded={handleLeadAdded}
        />
      )}
    </div>
  );
}
