"use client";
import { A } from "./palette";

const COLORS = [A.horizon, A.horizonDark, A.neptune, A.cosmos, A.aurora];

export default function Avatar({ name = "", size = 36 }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  const color = COLORS[name.charCodeAt(0) % COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, color: A.white,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
    }}>
      {initials || "?"}
    </div>
  );
}
