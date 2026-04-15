"use client";
import AppShell from "./components/AppShell";
import TriageBoard from "./components/TriageBoard";

export default function Dashboard() {
  return (
    <AppShell>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 16px" }}>
        <TriageBoard />
      </div>
    </AppShell>
  );
}
