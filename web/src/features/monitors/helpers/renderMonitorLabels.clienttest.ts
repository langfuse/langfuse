import { describe, expect, it } from "vitest";

import { renderNamePlaceholder } from "./renderMonitorLabels";

describe("renderNamePlaceholder", () => {
  it("measured metric: aggregation, view + measure, word operator, threshold", () => {
    expect(
      renderNamePlaceholder({
        view: "observations",
        metric: { measure: "latency", aggregation: "sum" },
        thresholdOperator: "LT",
        alertThreshold: 100,
      }),
    ).toBe("Sum Observations Latency below 100");
  });

  it("percentile aggregation: kept verbatim, not start-cased into 'P 95'", () => {
    expect(
      renderNamePlaceholder({
        view: "observations",
        metric: { measure: "latency", aggregation: "p95" },
        thresholdOperator: "GT",
        alertThreshold: 100,
      }),
    ).toBe("p95 Observations Latency above 100");
  });

  it("bare count: omits the measure", () => {
    expect(
      renderNamePlaceholder({
        view: "observations",
        metric: { measure: "count", aggregation: "count" },
        thresholdOperator: "GT",
        alertThreshold: 5,
      }),
    ).toBe("Count Observations above 5");
  });

  it("missing threshold: defaults the value to 0", () => {
    expect(
      renderNamePlaceholder({
        view: "observations",
        metric: { measure: "count", aggregation: "count" },
        thresholdOperator: "GT",
        alertThreshold: null,
      }),
    ).toBe("Count Observations above 0");
  });
});
