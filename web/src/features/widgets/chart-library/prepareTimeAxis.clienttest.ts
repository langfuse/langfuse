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
