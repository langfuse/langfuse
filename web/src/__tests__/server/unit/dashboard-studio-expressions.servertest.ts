import { describe, expect, it } from "vitest";
import { evaluateStudioFormula } from "@/src/features/dashboard/server/studio-expressions";

describe("dashboard studio expressions", () => {
  it("evaluates bounded arithmetic by stable references and preserves missing/zero-divisor semantics", () => {
    const cells = new Map([
      ["errors.count", { value: 12, unit: "observations" }],
      ["all.count", { value: 40, unit: "observations" }],
      ["empty.count", { value: 0, unit: "observations" }],
      ["latency.mean", { value: null, unit: "milliseconds" }],
      ["cost.total", { value: 2, unit: "USD" }],
    ]);
    expect(evaluateStudioFormula("errors.count / all.count", cells)).toEqual({
      value: 0.3,
      unit: "ratio",
    });
    expect(
      evaluateStudioFormula("(all.count - errors.count) * 2", cells),
    ).toEqual({ value: 56, unit: "observations" });
    expect(
      evaluateStudioFormula("errors.count / empty.count", cells).value,
    ).toBeNull();
    expect(
      evaluateStudioFormula("latency.mean + latency.mean", cells).value,
    ).toBeNull();
    expect(() =>
      evaluateStudioFormula("cost.total + all.count", cells),
    ).toThrow("compatible units");
    expect(() => evaluateStudioFormula("unknown.count", cells)).toThrow(
      "Unknown reference",
    );
    expect(() => evaluateStudioFormula("process.exit()", cells)).toThrow();
  });
});
