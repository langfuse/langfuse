import {
  prepareTimeAxis,
  parseChartTimestamp,
} from "@/src/features/widgets/chart-library/prepareTimeAxis";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const MONTH_DAY = /[A-Z][a-z]{2}\s\d/; // e.g. "Jun 28"

describe("prepareTimeAxis", () => {
  it("intraday span → time-only ticks (no dates)", () => {
    const start = Date.UTC(2026, 5, 28, 0);
    const values = Array.from({ length: 24 }, (_, h) => iso(start + h * HOUR));
    const axis = prepareTimeAxis(values, 6);

    expect(axis.mode).toBe("time");
    const label = axis.formatTick(values[5]);
    expect(/\d/.test(label)).toBe(true);
    expect(MONTH_DAY.test(label)).toBe(false); // never a date on a time-scale tick
  });

  it("span >24h uses date mode (no hour-only ticks repeating across midnight)", () => {
    // 36 hourly buckets ≈ 35h span — must NOT be time mode (would duplicate hours).
    const start = Date.UTC(2026, 5, 28, 0);
    const values = Array.from({ length: 36 }, (_, h) => iso(start + h * HOUR));
    const axis = prepareTimeAxis(values, 6);
    expect(axis.mode).toBe("date");
  });

  it("a single day (≤24h) stays time mode", () => {
    const start = Date.UTC(2026, 5, 28, 0);
    const values = Array.from({ length: 24 }, (_, h) => iso(start + h * HOUR));
    expect(prepareTimeAxis(values, 6).mode).toBe("time");
  });

  it("date ticks add the year only when the range crosses a year boundary", () => {
    const sameYear = Array.from({ length: 14 }, (_, d) =>
      iso(Date.UTC(2026, 5, 1) + d * DAY),
    );
    expect(
      /\d{4}/.test(prepareTimeAxis(sameYear, 6).formatTick(sameYear[0])),
    ).toBe(false);

    // Dec 26 → Jan 8 across the 2025/2026 boundary.
    const crossYear = Array.from({ length: 14 }, (_, d) =>
      iso(Date.UTC(2025, 11, 26) + d * DAY),
    );
    const axis = prepareTimeAxis(crossYear, 6);
    expect(axis.mode).toBe("date");
    expect(/2025|2026/.test(axis.formatTick(crossYear[0]))).toBe(true);
  });

  it("multi-day span → date ticks aligned to whole days (uniform gaps)", () => {
    // hourly buckets across 5 days → 120 points
    const start = Date.UTC(2026, 5, 1, 0);
    const values = Array.from({ length: 24 * 5 }, (_, i) =>
      iso(start + i * HOUR),
    );
    const axis = prepareTimeAxis(values, 6);

    expect(axis.mode).toBe("date");
    // bucketsPerDay = 24 → shown ticks land a whole number of days apart
    expect((axis.interval + 1) % 24).toBe(0);
    expect(MONTH_DAY.test(axis.formatTick(values[0]))).toBe(true);
  });

  it("daily buckets over a couple of weeks → date mode, evenly thinned", () => {
    const start = Date.UTC(2026, 5, 1, 0);
    const values = Array.from({ length: 14 }, (_, d) => iso(start + d * DAY));
    const axis = prepareTimeAxis(values, 5);

    expect(axis.mode).toBe("date");
    expect(axis.interval).toBeGreaterThanOrEqual(1); // 14 days, ≤5 ticks → skip some
  });

  it("very long span → month labels", () => {
    const start = Date.UTC(2026, 0, 1, 0);
    const values = Array.from({ length: 200 }, (_, d) => iso(start + d * DAY));
    const axis = prepareTimeAxis(values, 6);

    expect(axis.mode).toBe("month");
    expect(/[A-Z][a-z]{2}\s\d{4}/.test(axis.formatTick(values[0]))).toBe(true);
  });

  it("tooltip always carries the year", () => {
    const values = [
      iso(Date.UTC(2026, 5, 28, 23)),
      iso(Date.UTC(2026, 5, 29, 0)),
    ];
    const axis = prepareTimeAxis(values, 6);
    expect(/2026/.test(axis.formatTooltip(values[0]))).toBe(true);
  });

  it("tooltip keeps the time for sub-day buckets in date mode (distinguishes hours)", () => {
    // hourly buckets across 7 days → date mode, but each bucket is an hour
    const start = Date.UTC(2026, 5, 1, 0);
    const values = Array.from({ length: 24 * 7 }, (_, i) =>
      iso(start + i * HOUR),
    );
    const axis = prepareTimeAxis(values, 6);
    expect(axis.mode).toBe("date");
    const oneAm = axis.formatTooltip(iso(Date.UTC(2026, 5, 2, 1)));
    const elevenPm = axis.formatTooltip(iso(Date.UTC(2026, 5, 2, 23)));
    expect(oneAm).not.toBe(elevenPm); // 1 AM vs 11 PM must differ
    expect(/\b(AM|PM)\b/.test(oneAm)).toBe(true);
  });

  it("daily buckets get a time-free tooltip (no spurious 12:00 AM)", () => {
    const start = Date.UTC(2026, 5, 1, 0);
    const values = Array.from({ length: 14 }, (_, d) => iso(start + d * DAY));
    const axis = prepareTimeAxis(values, 6);
    expect(/\b(AM|PM)\b/.test(axis.formatTooltip(values[0]))).toBe(false);
  });

  it("non-temporal labels (compare-view run names) pass through verbatim", () => {
    // Bare integers and arbitrary strings are run names, not timestamps.
    const values = ["1", "47", "20241230", "baseline-run"];
    const axis = prepareTimeAxis(values, 6);
    expect(axis.mode).toBe("category");
    expect(axis.formatTick("20241230")).toBe("20241230");
    expect(axis.formatTick("baseline-run")).toBe("baseline-run");
    expect(axis.formatTooltip("1")).toBe("1");
  });

  it("does not coerce bare numeric strings into epoch dates", () => {
    expect(parseChartTimestamp("1")).toBeNull();
    expect(parseChartTimestamp("20241230")).toBeNull();
    expect(parseChartTimestamp("2026-06-28")?.getTime()).toBe(
      Date.UTC(2026, 5, 28),
    );
  });

  it("parses a no-timezone ClickHouse datetime as UTC (not local)", () => {
    expect(parseChartTimestamp("2026-06-28 23:00:00")?.getTime()).toBe(
      Date.UTC(2026, 5, 28, 23, 0, 0),
    );
    expect(parseChartTimestamp("2026-06-28T23:00:00.000Z")?.getTime()).toBe(
      Date.UTC(2026, 5, 28, 23, 0, 0),
    );
    expect(parseChartTimestamp("not a date")).toBeNull();
  });
});
