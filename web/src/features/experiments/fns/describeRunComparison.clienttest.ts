import { describe, expect, it } from "vitest";

import { describeRunComparison } from "./describeRunComparison";

describe("describeRunComparison", () => {
  // The direction is the whole point: `from` is the baseline, `to` is the run
  // the chip is attached to. Inverting it would silently invert every reading.
  it("names the baseline and calls the chip's own run 'this run'", () => {
    expect(
      describeRunComparison({
        baselineName: "sonnet-research-4-steps",
        baselineText: "true",
        currentText: "false",
      }),
    ).toBe("sonnet-research-4-steps true · this run false");
  });

  it("uses the metric's verb", () => {
    expect(
      describeRunComparison({
        baselineName: "run-a",
        baselineText: "$0.10",
        currentText: "$0.11",
        verb: "cost",
      }),
    ).toBe("run-a cost $0.10 · this run cost $0.11");
  });

  it("still reads without a name", () => {
    expect(
      describeRunComparison({ baselineText: "0.24", currentText: "0.63" }),
    ).toBe("The baseline 0.24 · this run 0.63");
  });
});
