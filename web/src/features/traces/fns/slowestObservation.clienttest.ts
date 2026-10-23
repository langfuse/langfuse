import { findSlowestObservationId, selfTimeMs } from "./slowestObservation";
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

describe("selfTimeMs", () => {
  it("subtracts the union of overlapping children, not their sum", () => {
    // Two parallel children covering 100..600 and 300..800: union is 700ms.
    const parent = node("p", 0, 1000, [
      node("a", 100, 600),
      node("b", 300, 800),
    ]);
    expect(selfTimeMs(parent)).toBe(300);
  });

  it("clips children to the parent's own interval", () => {
    const parent = node("p", 0, 1000, [node("late", 800, 2000)]);
    expect(selfTimeMs(parent)).toBe(800);
  });

  it("is zero without an end time", () => {
    expect(selfTimeMs(node("open", 0, null, [node("c", 0, 100)]))).toBe(0);
  });
});

describe("findSlowestObservationId", () => {
  it("lets a leaf beat the wrappers above it", () => {
    // Root agent 0..10000 wraps a 0..9000 step whose own work is one 8000ms leaf.
    const roots = trace(
      node("agent", 0, 10000, [
        node("step", 0, 9000, [
          node("leaf", 500, 8500),
          node("tiny", 8600, 8700),
        ]),
      ]),
    );
    expect(findSlowestObservationId(roots)).toBe("leaf");
  });

  it("excludes the root even when its untracked time is largest", () => {
    // Root self time 7000ms, but it is the whole trace.
    const roots = trace(
      node("agent", 0, 10000, [node("a", 0, 1000), node("b", 1000, 3000)]),
    );
    expect(findSlowestObservationId(roots)).toBe("b");
  });

  it("competes top-level observations when there are several", () => {
    const roots = trace(node("a", 0, 1000), node("b", 1000, 4000));
    expect(findSlowestObservationId(roots)).toBe("b");
  });

  it("counts overlapping parallel children as a union", () => {
    // Parent 0..1000 with children 100..350 and 200..450: union 350ms, so
    // self 650ms. Sibling leaf 2000..2600: self 600ms. Summing the children
    // (500ms) would have left the parent at 500ms and crowned the leaf.
    const roots = trace(
      node("agent", 0, 3000, [
        node("parent", 0, 1000, [node("a", 100, 350), node("b", 200, 450)]),
        node("leaf", 2000, 2600),
      ]),
    );
    expect(findSlowestObservationId(roots)).toBe("parent");
  });

  it("breaks ties by earliest start", () => {
    const roots = trace(
      node("agent", 0, 5000, [
        node("later", 1000, 2000),
        node("earlier", 500, 1500),
      ]),
    );
    expect(findSlowestObservationId(roots)).toBe("earlier");
  });

  it("marks nothing with fewer than two observations", () => {
    expect(findSlowestObservationId(trace())).toBeNull();
    expect(findSlowestObservationId(trace(node("only", 0, 1000)))).toBeNull();
    expect(
      findSlowestObservationId(
        trace(node("agent", 0, 1000, [node("only", 0, 500)])),
      ),
    ).toBeNull();
  });

  it("marks nothing when no observation has self time", () => {
    const roots = trace(
      node("agent", 0, 1000, [node("a", 0, null), node("b", 0, 0)]),
    );
    expect(findSlowestObservationId(roots)).toBeNull();
  });

  it("works on v4 traces without a TRACE wrapper", () => {
    const roots = [
      node("root", 0, 10000, [node("a", 0, 1000), node("b", 1000, 5000)]),
    ];
    expect(findSlowestObservationId(roots)).toBe("b");
  });

  it("excludes the v4 root observation even beside an orphaned sibling root", () => {
    const roots = [
      node("root", 0, 10000, [node("a", 0, 1000), node("b", 1000, 5000)]),
      node("orphan", 500, 700),
    ];
    expect(findSlowestObservationId(roots, "root")).toBe("b");
  });
});
