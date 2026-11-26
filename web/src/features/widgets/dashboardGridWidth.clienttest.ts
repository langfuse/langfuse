import { describe, expect, it } from "vitest";

import { reduceWidthSample } from "./dashboardGridWidth";

describe("reduceWidthSample", () => {
  it("publishes a width that arrives after a pause and holds the ones that follow", () => {
    const first = reduceWidthSample("quiet", 1212, null);
    expect(first).toEqual({
      phase: "pending",
      publish: 1212,
      armTimer: true,
    });

    const duringDrag = reduceWidthSample("pending", 1100, 1212);
    expect(duringDrag).toEqual({
      phase: "pending",
      publish: null,
      armTimer: true,
    });

    const unchanged = reduceWidthSample("quiet", 1212, 1212);
    expect(unchanged.publish).toBeNull();
    expect(unchanged.armTimer).toBe(false);
  });
});
