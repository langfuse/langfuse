import { describe, expect, it } from "vitest";

import { orderSamplesByTrace } from "./orderSamplesByTrace";

describe("orderSamplesByTrace", () => {
  it("walks down one trace before moving to the next", () => {
    const sample = (id: string, traceId: string, minute: number) => ({
      id,
      traceId,
      startTime: new Date(Date.UTC(2026, 0, 1, 10, minute)),
    });
    // Newest first, with two traces interleaved, as the list query returns them.
    const samples = [
      sample("a-child", "a", 9),
      sample("b-child", "b", 8),
      sample("a-root", "a", 7),
      sample("b-root", "b", 6),
    ];

    expect(orderSamplesByTrace(samples).map(({ id }) => id)).toEqual([
      "a-root",
      "a-child",
      "b-root",
      "b-child",
    ]);
  });
});
