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
    // bucketsPerDay = 24 → shown ticks land a whole number of days apart.
    // In date mode `interval` is always numeric (the string interval is only for
    // the categorical branch), but its type is `number | "equidistantPreserveStart"`,
    // so coerce for the arithmetic. (LFE-10602)
    expect((Number(axis.interval) + 1) % 24).toBe(0);
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

  it("categorical axis thins width-aware (equidistant), not by a numeric index step (LFE-10583)", () => {
    // The smear bug: a numeric recharts `interval` shows every Nth tick BY INDEX
    // and skips the label-collision test, so long entity names overlap however
    // few we target. The fix hands recharts "equidistantPreserveStart" so it
    // picks the even step whose *rendered* labels don't collide — even spacing,
    // width-aware, robust to hundreds of points.
    const manyLongRuns = Array.from(
      { length: 200 },
      (_, i) => `demo-dataset-run-${i}-demo-english-transcription-dataset`,
    );
    const axis = prepareTimeAxis(manyLongRuns, 6);
    expect(axis.mode).toBe("category");
    // The crux: NOT a numeric index step (which smears) — the width-aware one.
    expect(axis.interval).toBe("equidistantPreserveStart");
    // A deliberate gap between the (thinned) ticks, so they read as a handful.
    expect(axis.tickProps.minTickGap).toBeGreaterThan(0);
  });

  it("long categorical labels are angled and end-truncated, full name in tooltip (LFE-10583)", () => {
    // The experiments / dataset-compare x-axis: long entity (run) names that
    // recharts would otherwise render flat and overlap into a smear.
    const runs = [
      "demo-dataset-run-0-demo-english-transcription-dataset",
      "demo-dataset-run-1-demo-english-transcription-dataset",
      "demo-dataset-run-2-demo-english-transcription-dataset",
    ];
    const axis = prepareTimeAxis(runs, 6);
    expect(axis.mode).toBe("category");

    // Angled + end-anchored so neighbours don't collide horizontally.
    expect(axis.tickProps.angle).toBeLessThan(0);
    expect(axis.tickProps.textAnchor).toBe("end");

    // Shown tick is truncated (keeps the distinguishing head, drops the tail)…
    const shown = axis.formatTick(runs[1]);
    expect(shown.length).toBeLessThan(runs[1].length);
    expect(shown.endsWith("…")).toBe(true);
    expect(shown.startsWith("demo-dataset-run-1")).toBe(true);
    // …but the different runs still truncate to DIFFERENT strings.
    expect(axis.formatTick(runs[0])).not.toBe(axis.formatTick(runs[1]));

    // …while the tooltip carries the full, untruncated name (nothing lost).
    expect(axis.formatTooltip(runs[1])).toBe(runs[1]);
  });

  it("short categorical labels are not truncated and time ticks stay flat + numeric (dashboards unchanged)", () => {
    const shortCategories = prepareTimeAxis(["run-a", "run-b", "run-c"], 6);
    expect(shortCategories.formatTick("run-a")).toBe("run-a");
    expect(shortCategories.tickProps.angle).toBeLessThan(0);

    // Time-mode ticks are unchanged: flat tickProps AND a numeric index step, so
    // dashboards render pixel-identically (no width-aware equidistant thinning).
    const start = Date.UTC(2026, 5, 28, 0);
    const timeVals = Array.from({ length: 24 }, (_, h) =>
      iso(start + h * HOUR),
    );
    const timeAxis = prepareTimeAxis(timeVals, 6);
    expect(timeAxis.tickProps).toEqual({});
    expect(typeof timeAxis.interval).toBe("number");
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
