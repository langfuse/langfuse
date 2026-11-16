import { describe, expect, it } from "vitest";
import { queryWindowFromMs, queryWindowFromRange } from "./queryWindow";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe("query window buckets", () => {
  it.each([
    [0, "1h"],
    [HOUR_MS, "1h"],
    [HOUR_MS + 1, "1d"],
    [DAY_MS, "1d"],
    [10 * DAY_MS, "30d"],
    [365 * DAY_MS, "1y"],
    [365 * DAY_MS + 1, "gt_1y"],
    [-1, "none"],
    [Number.NaN, "none"],
  ])("labels a %d ms span as %s", (spanMs, expected) => {
    expect(queryWindowFromMs(spanMs)).toBe(expected);
  });

  it("buckets the span between ISO timestamps and treats invalid ones as none", () => {
    expect(
      queryWindowFromRange("2026-01-01T00:00:00Z", "2026-01-11T00:00:00Z"),
    ).toBe("30d");
    expect(queryWindowFromRange("not-a-date", "2026-01-11T00:00:00Z")).toBe(
      "none",
    );
  });
});
