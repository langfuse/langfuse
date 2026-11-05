// @vitest-environment node

// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import {
  formatCompactRelativeTime,
  formatIntervalSeconds,
  getRelativeTimestampFromNow,
} from "@/src/utils/dates";

describe("formatCompactRelativeTime", () => {
  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);
  const DAY = 24 * 60 * 60;

  it.each([
    [30, "just now"],
    [5 * 60, "5m ago"],
    [3 * 60 * 60, "3h ago"],
    [15 * DAY, "15d ago"],
    [45 * DAY, "1mo ago"],
    // days 360-364 must stay in months, not round down to "0y ago"
    [362 * DAY, "12mo ago"],
    [400 * DAY, "1y ago"],
    [800 * DAY, "2y ago"],
  ])("formats %ds ago as %s", (seconds, expected) => {
    expect(formatCompactRelativeTime(ago(seconds))).toBe(expected);
  });

  it("clamps future timestamps to just now", () => {
    expect(formatCompactRelativeTime(ago(-120))).toBe("just now");
  });
});

describe("formatIntervalSeconds", () => {
  it("keeps sub-minute durations in decimal-seconds form", () => {
    expect(formatIntervalSeconds(5)).toBe("5.00s");
    expect(formatIntervalSeconds(59.4, 1)).toBe("59.4s");
  });

  it("zero-pads single-digit minute/second components", () => {
    // pad() previously sliced from the front ("005".slice(2) === "5"), so
    // single-digit components rendered unpadded ("20m 0s", "1h 5m 3s").
    expect(formatIntervalSeconds(1200)).toBe("20m 00s");
    expect(formatIntervalSeconds(3903)).toBe("1h 05m 03s");
    expect(formatIntervalSeconds(9945)).toBe("2h 45m 45s");
  });
});

describe("getRelativeTimestampFromNow", () => {
  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);
  const DAY = 24 * 60 * 60;

  it('shows "just now" for sub-minute timestamps', () => {
    expect(getRelativeTimestampFromNow(ago(0))).toBe("just now");
    expect(getRelativeTimestampFromNow(ago(30))).toBe("just now");
    expect(getRelativeTimestampFromNow(ago(59))).toBe("just now");
  });

  it("clamps future timestamps to just now", () => {
    expect(getRelativeTimestampFromNow(ago(-120))).toBe("just now");
  });

  it("uses correct singular form for exactly 1 unit", () => {
    expect(getRelativeTimestampFromNow(ago(60))).toBe("1 minute ago");
    expect(getRelativeTimestampFromNow(ago(60 * 60))).toBe("1 hour ago");
    expect(getRelativeTimestampFromNow(ago(DAY))).toBe("1 day ago");
  });

  it("uses correct plural form for multiple units", () => {
    expect(getRelativeTimestampFromNow(ago(5 * 60))).toBe("5 minutes ago");
    expect(getRelativeTimestampFromNow(ago(3 * 60 * 60))).toBe("3 hours ago");
    expect(getRelativeTimestampFromNow(ago(6 * DAY))).toBe("6 days ago");
  });

  it("falls back to a locale date string after 7 days", () => {
    const result = getRelativeTimestampFromNow(ago(8 * DAY));
    // toLocaleDateString("en-US", { year: "2-digit", month: "numeric", day: "numeric" })
    // produces e.g. "9/22/26" — verify it matches numeric date pattern
    expect(result).toMatch(/^\d{1,2}\/\d{1,2}\/\d{2}$/);
  });
});
