import { describe, expect, it } from "vitest";

import { renderNamePlaceholder } from "./renderMonitorLabels";

describe("renderNamePlaceholder", () => {
  it("measured metric: aggregation, view + measure, word operator, threshold, window", () => {
    expect(
      renderNamePlaceholder({
        view: "observations",
        metric: { measure: "latency", aggregation: "sum" },
        thresholdOperator: "LT",
        alertThreshold: 100,
        window: "5m",
      }),
    ).toBe("Sum Observations Latency below 100 in the last 5 minutes");
  });

  it("percentile aggregation: kept verbatim, not start-cased into 'P 95'", () => {
    expect(
      renderNamePlaceholder({
        view: "observations",
        metric: { measure: "latency", aggregation: "p95" },
        thresholdOperator: "GT",
        alertThreshold: 100,
        window: "1h",
      }),
    ).toBe("p95 Observations Latency above 100 in the last hour");
  });

  it("bare count: omits the measure", () => {
    expect(
      renderNamePlaceholder({
        view: "observations",
        metric: { measure: "count", aggregation: "count" },
        thresholdOperator: "GT",
        alertThreshold: 5,
        window: "1w",
      }),
    ).toBe("Count Observations above 5 in the last week");
  });

  it("missing threshold: defaults the value to 0", () => {
    expect(
      renderNamePlaceholder({
        view: "observations",
        metric: { measure: "count", aggregation: "count" },
        thresholdOperator: "GT",
        alertThreshold: null,
        window: "5m",
      }),
    ).toBe("Count Observations above 0 in the last 5 minutes");
  });
});
