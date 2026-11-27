import { describe, expect, it } from "vitest";
import { findLiveWriteStart } from "../backgroundMigrations/utils/liveWriteWindow";

const HOUR = 60 * 60 * 1000;
const hour = (n: number) => Date.UTC(2026, 10, 1) + n * HOUR;

describe("findLiveWriteStart", () => {
  it("starts after the last legacy-only hour, ignoring hours that have not settled", () => {
    const live = [
      // An earlier dual-write stint, later switched off.
      { hourMs: hour(0), firstEventMs: hour(0) + 10 * 60_000 },
      { hourMs: hour(1), firstEventMs: hour(1) },
      // The current dual-write period.
      { hourMs: hour(5), firstEventMs: hour(5) + 30 * 60_000 },
      { hourMs: hour(6), firstEventMs: hour(6) },
    ];
    const legacy = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      hourMs: hour(n),
      rows: 100,
    }));

    // Hours 7 and 8 have no live rows yet, but are within the settling time.
    expect(findLiveWriteStart({ live, legacy, nowMs: hour(9) })).toBe(
      hour(5) + 30 * 60_000,
    );
    // Once settled, a legacy-only hour means dual write is off again.
    expect(findLiveWriteStart({ live, legacy, nowMs: hour(12) })).toBeNull();
  });
});
