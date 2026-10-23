// @vitest-environment node

import { describe, expect, it } from "vitest";
import { formatValue } from "./values";

describe("formatValue", () => {
  it("formats numbers by kind, and counts with the same format", () => {
    const percent = formatValue(0.87, { format: "percent" });
    expect(percent.text).toBe("87%");
    expect(percent.count?.format(0.431)).toBe("43%");

    expect(formatValue(0.2).text).toBe("0.2");
    expect(formatValue(218).text).toBe("218");
    expect(formatValue(18.22, { format: "duration" }).text).toBe("18.22s");
    expect(formatValue(2.5, { format: "currency" }).text).toBe("$2.50");
    expect(formatValue(0.00064, { format: "currency" }).text).toBe("$0.00064");
    expect(formatValue(1200, { format: "count" }).text).toBe("1,200");
    expect(formatValue(1200, { format: "compact" }).text).toBe("1.2K");
  });

  it("never counts wider than the value it lands on", () => {
    const cases = [
      [0.00064, "currency"],
      [0.001688, "currency"],
      [18.22, "duration"],
      [0.87, "percent"],
      [0.2, "decimal"],
    ] as const;
    for (const [value, format] of cases) {
      const formatted = formatValue(value, { format });
      const steps = Array.from({ length: 101 }, (_, i) =>
        formatted.count!.format((value * i) / 100),
      );
      for (const step of steps)
        expect(step.length, `${value} → ${step}`).toBeLessThanOrEqual(
          formatted.text.length,
        );
    }
  });

  it("reads booleans as True and False, shows strings as given, and counts neither", () => {
    expect(formatValue(true)).toEqual({ text: "True", full: "True" });
    expect(formatValue("Needs review", { max: 9 })).toEqual({
      text: "Needs re…",
      full: "Needs review",
    });
  });
});
