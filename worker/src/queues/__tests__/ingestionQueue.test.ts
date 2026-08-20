import { describe, expect, it } from "vitest";

import { getEarliestFileCreatedAt } from "../getEarliestFileCreatedAt";

describe("getEarliestFileCreatedAt", () => {
  it("returns the earliest timestamp when Date strings sort non-chronologically", () => {
    const earlier = new Date("2026-07-29T12:00:00.000Z");
    const later = new Date("2026-07-30T12:00:00.000Z");

    expect(getEarliestFileCreatedAt([earlier, later])).toEqual(earlier);
  });
});
