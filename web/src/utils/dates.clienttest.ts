import { describe, it, expect } from "vitest";
import { formatCompactRelativeTime } from "@/src/utils/dates";

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
