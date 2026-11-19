import { describe, expect, it } from "vitest";
import { nextNightlyRefitSlot, nightlyRefitSlot } from "./nightly-refit-slot";

const hourUtc = 4;
const now = new Date("2026-11-04T06:00:00.000Z");

describe("nightlyRefitSlot", () => {
  it("spreads projects within the window after the configured hour", () => {
    const slots = Array.from({ length: 50 }, (_, index) =>
      nightlyRefitSlot(`project-${index}`, now, hourUtc),
    );
    for (const slot of slots) {
      expect(slot.getTime()).toBeGreaterThanOrEqual(
        Date.parse("2026-11-04T04:00:00.000Z"),
      );
      expect(slot.getTime()).toBeLessThan(
        Date.parse("2026-11-04T04:30:00.000Z"),
      );
    }
    expect(new Set(slots.map(Number)).size).toBeGreaterThan(10);
    expect(nightlyRefitSlot("project-0", now, hourUtc)).toEqual(slots[0]);
  });

  it("returns the previous day's slot before today's has passed", () => {
    const slot = nightlyRefitSlot(
      "project",
      new Date("2026-11-04T03:00:00.000Z"),
      hourUtc,
    );
    expect(slot.toISOString().startsWith("2026-11-03T04:")).toBe(true);
  });

  it("returns today's slot as the next one before it has passed", () => {
    const next = nextNightlyRefitSlot(
      "project",
      new Date("2026-11-04T03:00:00.000Z"),
      hourUtc,
    );
    expect(next.toISOString().startsWith("2026-11-04T04:")).toBe(true);
  });
});
