import { describe, expect, it } from "vitest";
import { tracesFitHitTarget } from "./tracesFitHitTarget";

describe("tracesFitHitTarget", () => {
  it("counts padding and the pill inset, not a separator between every piece", () => {
    const widths = Array.from({ length: 36 }, () => 1);
    expect(tracesFitHitTarget(widths, widths, 364)).toBe(true);
    expect(tracesFitHitTarget(widths, widths, 360)).toBe(false);
  });
});
