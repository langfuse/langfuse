import { pickLongestLeafObservation } from "./longestLeafObservation";
import { type TreeNode } from "../types/treeNode";

const at = (ms: number) => new Date(ms);

const node = (
  id: string,
  startMs: number,
  endMs: number | null,
  children: TreeNode[] = [],
): TreeNode => ({
  id,
  type: "SPAN",
  name: id,
  startTime: at(startMs),
  endTime: endMs == null ? null : at(endMs),
  children,
  startTimeSinceTrace: startMs,
  startTimeSinceParentStart: null,
  depth: 0,
  childrenDepth: 0,
});

const traceRoot = (children: TreeNode[]): TreeNode => ({
  id: "trace-t",
  type: "TRACE",
  name: "t",
  startTime: at(0),
  endTime: null,
  children,
  latency: 10,
  startTimeSinceTrace: 0,
  startTimeSinceParentStart: null,
  depth: -1,
  childrenDepth: 1,
});

describe("pickLongestLeafObservation", () => {
  it("picks the longest leaf and ignores wrappers that outlast it", () => {
    const roots = [
      traceRoot([
        node("wrapper", 0, 10_000, [
          node("short", 0, 1_000),
          node("long", 1_000, 5_000),
        ]),
      ]),
    ];

    expect(
      pickLongestLeafObservation(roots, { traceTotalDurationMs: 10_000 }),
    ).toEqual({ id: "long", durationMs: 4_000, shareOfTrace: 0.4 });
  });

  it("breaks ties by the earliest start", () => {
    const roots = [
      traceRoot([node("later", 2_000, 5_000), node("earlier", 0, 3_000)]),
    ];

    expect(pickLongestLeafObservation(roots)?.id).toBe("earlier");
  });

  it("returns null with fewer than two leaves", () => {
    const roots = [
      traceRoot([node("wrapper", 0, 5_000, [node("only", 0, 4_000)])]),
    ];

    expect(pickLongestLeafObservation(roots)).toBeNull();
  });

  it("returns null when the trace was capped", () => {
    const roots = [traceRoot([node("a", 0, 1_000), node("b", 0, 2_000)])];

    expect(
      pickLongestLeafObservation(roots, { truncatedAtObservations: 2 }),
    ).toBeNull();
  });
});
