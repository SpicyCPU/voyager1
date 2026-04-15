"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { A } from "../components/ui/palette";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Invalid password");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: A.nebulaDark,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: A.white,
        borderRadius: 12,
        padding: "40px 36px",
        width: 340,
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
      }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{
            width: 40, height: 40,
            background: A.horizon,
            borderRadius: 10,
            margin: "0 auto 12px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: A.white, fontWeight: 700, fontSize: 18 }}>V</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: A.text }}>Voyager 1</div>
          <div style={{ fontSize: 13, color: A.textMuted, marginTop: 4 }}>Apollo Outreach</div>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: A.text, marginBottom: 6 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter site password"
            autoFocus
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "9px 12px", borderRadius: 7,
              border: `1.5px solid ${error ? "#e53e3e" : A.satellite}`,
              fontSize: 14, color: A.text,
              outline: "none", marginBottom: 8,
            }}
          />
          {error && (
            <div style={{ fontSize: 12, color: "#e53e3e", marginBottom: 10 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: "100%", padding: "10px 0",
              background: loading || !password ? A.satellite : A.horizon,
              color: loading || !password ? A.textMuted : A.white,
              border: "none", borderRadius: 7,
              fontSize: 14, fontWeight: 600,
              cursor: loading || !password ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
