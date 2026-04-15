"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "../../components/AppShell";
import ReviewMode from "../../components/ReviewMode";
import { A } from "../../components/ui/palette";

export default function ReviewLeadPage() {
  const { leadId } = useParams();
  const [lead, setLead] = useState(null);
  const [queueIds, setQueueIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Get queue snapshot from sessionStorage
    const stored = sessionStorage.getItem("review_queue");
    let ids = stored ? JSON.parse(stored) : [];
    if (!ids.includes(leadId)) {
      ids = [leadId];
      sessionStorage.setItem("review_queue", JSON.stringify(ids));
    }
    setQueueIds(ids);

    // Fetch the lead
    fetch(`/api/leads/${leadId}`)
      .then(r => r.json())
      .then(data => {
        if (data.lead) {
          setLead(data.lead);
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [leadId]);

  if (loading) return (
    <AppShell>
      <div style={{ padding: 60, textAlign: "center", color: A.textMuted, fontSize: 14 }}>
        Loading…
      </div>
    </AppShell>
  );

  if (error || !lead) return (
    <AppShell>
      <div style={{ padding: 60, textAlign: "center", color: A.textMuted, fontSize: 14 }}>
        Lead not found
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <ReviewMode
        lead={lead}
        queueIds={queueIds}
        currentIndex={queueIds.indexOf(leadId)}
      />
    </AppShell>
  );
}
