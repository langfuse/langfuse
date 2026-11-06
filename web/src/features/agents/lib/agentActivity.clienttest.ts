import { describe, expect, it } from "vitest";
import {
  prepareAgentActivity,
  selectAgentActivityRange,
  toAgentActivityState,
} from "./agentActivity";

describe("agent activity presentation", () => {
  const from = new Date("2026-11-06T10:00:00.000Z");
  const to = new Date("2026-11-06T10:02:30.000Z");
  const bucketMs = 60_000;

  it("keeps zero activity distinct from missing or failed history and clips selection to the selected period", () => {
    const prepared = prepareAgentActivity({
      from,
      to,
      bucketMs,
      buckets: [
        { timestamp: from, count: 0 },
        { timestamp: new Date("2026-11-06T10:02:00.000Z"), count: 4 },
      ],
    });
    expect(prepared.values).toEqual([0, null, 4]);
    expect(prepared.total).toBeNull();
    expect(prepared.plot.lines).toHaveLength(0);
    expect(prepared.plot.points).toHaveLength(2);

    const complete = prepareAgentActivity({
      from,
      to,
      bucketMs,
      buckets: [
        { timestamp: from, count: 0 },
        { timestamp: new Date("2026-11-06T10:01:00.000Z"), count: 0 },
        { timestamp: new Date("2026-11-06T10:02:00.000Z"), count: 0 },
      ],
    });
    expect(complete.total).toBe(0);
    expect(complete.plot.lines).toHaveLength(1);
    expect(
      toAgentActivityState({
        isPending: false,
        isError: true,
        data: { from, to, bucketMs, buckets: [] },
      }),
    ).toEqual({ status: "error" });
    expect(
      selectAgentActivityRange(
        {
          fromMs: to.getTime() - 30_000,
          toMs: to.getTime() + 30_000,
        },
        { from, to },
      ),
    ).toEqual({
      from: new Date("2026-11-06T10:02:00.000Z"),
      to,
    });
    expect(
      selectAgentActivityRange(
        {
          fromMs: to.getTime(),
          toMs: to.getTime() + 60_000,
        },
        { from, to },
      ),
    ).toBeNull();
  });
});
