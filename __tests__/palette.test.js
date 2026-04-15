import { describe, it, expect } from "vitest";
import { A } from "../app/components/ui/palette";

describe("palette", () => {
  it("exports all required brand colors", () => {
    expect(A.horizon).toBe("#FC5200");
    expect(A.nebula).toBe("#15252D");
    expect(A.white).toBe("#FFFFFF");
    expect(A.text).toBe("#15252D");
    expect(A.textMuted).toBeDefined();
    expect(A.satellite).toBeDefined();
  });

  it("has faint/dark horizon variants for signal badges", () => {
    expect(A.horizonFaint).toBeDefined();
    expect(A.horizonDark).toBeDefined();
  });
});
