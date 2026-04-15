"use client";
import { A } from "./palette";

const variants = {
  primary:      { background: A.horizon,      color: A.white,    border: "none" },
  secondary:    { background: A.satelliteLight,color: A.text,     border: `1px solid ${A.satellite}` },
  secondaryDark:{ background: A.nebulaLight,  color: A.white,    border: "none" },
  ghost:        { background: "transparent",  color: A.textMuted, border: `1px solid ${A.satellite}` },
  success:      { background: A.aurora,       color: A.nebula,   border: "none" },
  danger:       { background: "#fee2e2",      color: "#dc2626",  border: "1px solid #fca5a5" },
};

export default function Btn({ children, onClick, disabled, variant = "secondary", small, style }) {
  const v = variants[variant] ?? variants.secondary;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...v,
        padding: small ? "4px 10px" : "8px 16px",
        borderRadius: 6,
        fontSize: small ? 12 : 13,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.12s",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
