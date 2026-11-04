import { describe, expect, it } from "vitest";

import {
  buildProductionReviewMarkdown,
  type ProductionReviewMeasurements,
} from "@/src/features/production-reviews/buildProductionReviewMarkdown";

const windowStart = new Date("2026-11-03T16:00:00.000Z");
const windowEnd = new Date("2026-11-04T16:00:00.000Z");

function measurements(
  overrides: Partial<ProductionReviewMeasurements> = {},
): ProductionReviewMeasurements {
  return {
    windowStart,
    windowEnd,
    volume: 0,
    previousVolume: 0,
    topTraces: [],
    previousTopTraces: [],
    slowest: [],
    errors: [],
    previousErrors: [],
    costUsd: 0,
    previousCostUsd: 0,
    scores: [],
    previousScores: [],
    topics: [],
    topicsUnavailable: false,
    ...overrides,
  };
}

describe("buildProductionReviewMarkdown", () => {
  it("writes the movements that stand out and keeps trace names inside one table cell", () => {
    const markdown = buildProductionReviewMarkdown(
      measurements({
        volume: 187,
        previousVolume: 67,
        topTraces: [{ name: "chat", value: 120 }],
        previousTopTraces: [{ name: "chat", value: 40 }],
        slowest: [{ name: "chat", p95Ms: 2400 }],
        errors: [{ name: "a|b", value: 12 }],
        previousErrors: [{ name: "a|b", value: 2 }],
        costUsd: 4.5,
        previousCostUsd: 1.2,
        scores: [{ name: "helpfulness", average: 0.4, count: 30 }],
        previousScores: [{ name: "helpfulness", average: 0.7, count: 25 }],
        topics: [{ name: "billing", value: 40 }],
      }),
    );

    expect(markdown).toContain(
      "2026-11-03T16:00:00.000Z to 2026-11-04T16:00:00.000Z",
    );
    expect(markdown).toContain("| Volume | 187 root traces, +179% from 67 |");
    expect(markdown).toContain("| Errors | a\\|b 12 (was 2) |");
    expect(markdown).toContain("| Cost | $4.50, +275% from $1.20 |");
    expect(markdown).toContain("Root traces went from 67 to 187.");
    expect(markdown).toContain(
      'Error observations named "a|b" went from 2 to 12.',
    );
    expect(markdown).toContain(
      "The helpfulness score average fell from 0.70 to 0.40 (30 scores, 25 the day before).",
    );
    expect(markdown).toContain("billing 40");
    expect(markdown).toContain(
      'Open Tracing and look at error observations named "a|b".',
    );
    expect(markdown).toContain(
      "Open Scores and read recent helpfulness values.",
    );
    expect(markdown).not.toContain("Nothing in these measurements stands out.");
  });

  it("does not invent an issue when the two days match", () => {
    const markdown = buildProductionReviewMarkdown(measurements());

    expect(markdown).toContain(
      "Nothing in the last 24 hours stands out against the day before.",
    );
    expect(markdown).toContain("| Volume | 0 root traces, unchanged from 0 |");
    expect(markdown).toContain("| Errors | None |");
    expect(markdown).toContain("Nothing in these measurements stands out.");
    expect(markdown).toContain(
      "Run this review again tomorrow and compare it with this one.",
    );
    expect(markdown).not.toContain("No measurements found");
  });

  it("keeps the report when one measurement fails", () => {
    const markdown = buildProductionReviewMarkdown(
      measurements({ volume: null, previousVolume: null }),
    );

    expect(markdown).toContain("| Volume | No measurements found |");
    expect(markdown).toContain("Some measurements did not load: volume.");
    expect(markdown).toContain("| Cost | $0.00, unchanged from $0.00 |");
  });
});
