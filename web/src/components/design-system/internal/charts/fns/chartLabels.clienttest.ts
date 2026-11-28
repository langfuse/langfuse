import { describe, expect, it } from "vitest";
import { chartLabelUnits, truncateChartLabelToFit } from "./chartLabels";

describe("chart label sizing", () => {
  it("accounts for the width of emoji-heavy labels when truncating", () => {
    const label = "🚀".repeat(10);
    expect(chartLabelUnits(label)).toBe(30);
    expect(truncateChartLabelToFit(label, 11)).toBe("🚀".repeat(3) + "…");
    expect(truncateChartLabelToFit(label, 30)).toBe(label);
  });

  it("keeps emoji clusters intact and preserves ordinary label budgets", () => {
    expect(truncateChartLabelToFit("👩🏽‍🚀🇨🇳a", 4)).toBe("👩🏽‍🚀…");
    expect(truncateChartLabelToFit("abcdef", 4)).toBe("abc…");
    expect(truncateChartLabelToFit("éa", 2)).toBe("éa");
    expect(truncateChartLabelToFit("🚀", 0)).toBe("");
  });
});
