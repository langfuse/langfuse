import { describe, expect, it } from "vitest";
import { chartLabelUnits, truncateChartLabel } from "./chartLabels";

describe("chart label sizing", () => {
  it("accounts for the width of emoji-heavy labels when truncating", () => {
    const label = "🚀".repeat(10);
    expect(chartLabelUnits(label)).toBe(20);
    expect(truncateChartLabel(label, 11)).toBe("🚀".repeat(5) + "…");
    expect(truncateChartLabel(label, 20)).toBe(label);
  });

  it("keeps emoji clusters intact and preserves ordinary label budgets", () => {
    expect(truncateChartLabel("👩🏽‍🚀🇨🇳a", 3)).toBe("👩🏽‍🚀…");
    expect(truncateChartLabel("abcdef", 4)).toBe("abc…");
    expect(truncateChartLabel("éa", 2)).toBe("éa");
    expect(truncateChartLabel("🚀", 0)).toBe("");
  });
});
