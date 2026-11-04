import { findLongestLeafObservations } from "./longestObservations";
import { type TreeNode } from "../types/treeNode";

const T0 = Date.UTC(2024, 0, 1);
const at = (ms: number) => new Date(T0 + ms);

function node(
  id: string,
  startMs: number,
  endMs: number | null,
  children: TreeNode[] = [],
  type: TreeNode["type"] = "SPAN",
): TreeNode {
  return {
    id,
    type,
    name: id,
    startTime: at(startMs),
    endTime: endMs == null ? null : at(endMs),
    children,
    startTimeSinceTrace: startMs,
    startTimeSinceParentStart: null,
    depth: 0,
    childrenDepth: 0,
  };
}

/** A v3 trace: observations wrapped in one TRACE node. */
const trace = (...children: TreeNode[]) => [
  node("trace-1", 0, null, children, "TRACE"),
];

const ids = (roots: TreeNode[], options?: { truncated?: boolean }) =>
  findLongestLeafObservations(roots, options).map((o) => o.id);

describe("findLongestLeafObservations", () => {
  it("lists leaves only, so the root and wrappers never appear", () => {
    // agent 0..10000 wraps step 0..9000; both are longer than every leaf.
    const roots = trace(
      node("agent", 0, 10000, [
        node("step", 0, 9000, [
          node("llm", 500, 3500),
          node("tool", 4000, 4500),
          node("tiny", 8600, 8700),
        ]),
        node("final", 9000, 10000),
      ]),
    );
    expect(ids(roots)).toEqual(["llm", "final", "tool"]);
    expect(findLongestLeafObservations(roots)[0]).toEqual({
      id: "llm",
      name: "llm",
      durationMs: 3000,
    });
  });

  it("breaks ties by earliest start", () => {
    const roots = trace(
      node("agent", 0, 5000, [
        node("later", 2000, 3000),
        node("earlier", 500, 1500),
        node("short", 3000, 3100),
      ]),
    );
    expect(ids(roots)).toEqual(["earlier", "later", "short"]);
  });

  it("lists nothing with fewer than two leaves", () => {
    expect(ids(trace())).toEqual([]);
    expect(ids(trace(node("only", 0, 1000)))).toEqual([]);
    // An open-ended leaf has no duration, so it does not count.
    expect(
      ids(
        trace(
          node("agent", 0, 1000, [node("a", 0, 500), node("b", 500, null)]),
        ),
      ),
    ).toEqual([]);
  });

  it("lists nothing for a trace capped by the observation limit", () => {
    const roots = trace(
      node("agent", 0, 5000, [node("a", 0, 1000), node("b", 1000, 3000)]),
    );
    expect(ids(roots)).toEqual(["b", "a"]);
    expect(ids(roots, { truncated: true })).toEqual([]);
  });

  it("works on v4 traces without a TRACE wrapper", () => {
    const roots = [
      node("root", 0, 10000, [node("a", 0, 1000), node("b", 1000, 5000)]),
    ];
    expect(ids(roots)).toEqual(["b", "a"]);
  });
});
