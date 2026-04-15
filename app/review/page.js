"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../components/AppShell";
import { A } from "../components/ui/palette";

export default function ReviewPage() {
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("review_queue");
    if (stored) {
      const ids = JSON.parse(stored);
      if (ids.length > 0) {
        router.replace(`/review/${ids[0]}`);
        return;
      }
    }
    // Fetch fresh queue
    fetch("/api/queue")
      .then(r => r.json())
      .then(data => {
        if (data.leads?.length > 0) {
          const ids = data.leads.map(l => l.id);
          sessionStorage.setItem("review_queue", JSON.stringify(ids));
          router.replace(`/review/${ids[0]}`);
        } else {
          router.replace("/");
        }
      })
      .catch(() => router.replace("/"));
  }, []);

  return (
    <AppShell>
      <div style={{ padding: 60, textAlign: "center", color: A.textMuted, fontSize: 14 }}>
        Loading review queue…
      </div>
    </AppShell>
  );
}
