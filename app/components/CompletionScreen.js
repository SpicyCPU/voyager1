"use client";
import { useRouter } from "next/navigation";
import { A } from "./ui/palette";
import Btn from "./ui/Btn";

export default function CompletionScreen({ sentToday = [] }) {
  const router = useRouter();

  function goBack() {
    sessionStorage.removeItem("review_queue");
    router.push("/");
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "calc(100vh - 92px)",
      padding: 40, textAlign: "center",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%", background: A.aurora,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, marginBottom: 20, color: A.nebula,
      }}>
        ✓
      </div>

      <h2 style={{ fontSize: 26, fontWeight: 800, color: A.nebula, margin: "0 0 8px" }}>
        All finished.
      </h2>
      <p style={{ color: A.textMuted, fontSize: 15, margin: "0 0 32px", lineHeight: 1.5 }}>
        Come back tomorrow for more leads uploaded at 6AM.
      </p>

      {sentToday.length > 0 && (
        <div style={{
          marginBottom: 32, textAlign: "left", width: "100%", maxWidth: 360,
          background: A.white, border: `1px solid ${A.satellite}`, borderRadius: 10, overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px", fontSize: 11, fontWeight: 700, color: A.textMuted,
            textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${A.satelliteLight}`,
          }}>
            {sentToday.length} sent this session
          </div>
          {sentToday.map(l => (
            <div key={l.id} style={{
              padding: "10px 16px", fontSize: 13, color: A.text,
              borderBottom: `1px solid ${A.satelliteLight}`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontWeight: 600 }}>{l.name}</span>
              {l.account?.company && (
                <span style={{ color: A.textMuted }}>at {l.account.company}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <Btn variant="secondary" onClick={() => { sessionStorage.removeItem("review_queue"); router.push("/accounts"); }}>
          Manage accounts
        </Btn>
        <Btn variant="primary" onClick={goBack}>
          Back to Dashboard
        </Btn>
      </div>
    </div>
  );
}
