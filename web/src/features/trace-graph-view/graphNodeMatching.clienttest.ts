// @vitest-environment jsdom

import {
  matchedGraphNodeNames,
  nearestGraphNodeName,
  type GraphNodeResolution,
} from "./graphNodeMatching";

type Obs = {
  id: string;
  parentObservationId: string | null;
  node: string | null;
};

const observations = (rows: Obs[]) => new Map(rows.map((o) => [o.id, o]));

// classify (step "classify") -> obs-2 (same step, unregistered) -> obs-evt (an
// EVENT, dropped from the graph and carrying no step of its own).
const aggregated: GraphNodeResolution = {
  isExpanded: false,
  observationsById: observations([
    { id: "obs-1", parentObservationId: null, node: "classify" },
    { id: "obs-2", parentObservationId: "obs-1", node: "classify" },
    { id: "obs-evt", parentObservationId: "obs-2", node: null },
    { id: "obs-orphan", parentObservationId: null, node: null },
  ]),
  graphNodeIds: new Set(["classify", "respond", "__start__", "__end__"]),
  // Only what the normalized data registers: the EVENT has no step.
  nodeByObservationId: new Map([
    ["obs-1", "classify"],
    ["obs-2", "classify"],
  ]),
};

describe("nearestGraphNodeName", () => {
  it("walks up to the nearest ancestor carrying a step name", () => {
    // The EVENT itself is not in the graph; its enclosing step is.
    expect(nearestGraphNodeName("obs-evt", aggregated)).toBe("classify");
  });

  it("walks up to the nearest ancestor that IS a node, in expanded mode", () => {
    const expanded: GraphNodeResolution = {
      isExpanded: true,
      observationsById: observations([
        { id: "obs-1", parentObservationId: null, node: null },
        { id: "obs-evt", parentObservationId: "obs-1", node: null },
      ]),
      // EVENTs are excluded from the expanded graph, so only obs-1 is a node.
      graphNodeIds: new Set(["obs-1"]),
      nodeByObservationId: new Map(),
    };
    expect(nearestGraphNodeName("obs-evt", expanded)).toBe("obs-1");
  });

  it("returns null rather than looping when no ancestor is a node", () => {
    expect(nearestGraphNodeName("obs-orphan", aggregated)).toBeNull();
    expect(nearestGraphNodeName("not-an-observation", aggregated)).toBeNull();
    // Cyclic parent references are data, not an invariant.
    const cyclic: GraphNodeResolution = {
      ...aggregated,
      observationsById: observations([
        { id: "x", parentObservationId: "y", node: null },
        { id: "y", parentObservationId: "x", node: null },
      ]),
      nodeByObservationId: new Map(),
    };
    expect(nearestGraphNodeName("x", cyclic)).toBeNull();
  });
});

describe("matchedGraphNodeNames", () => {
  // What the graph registers for click-cycling: the top-most call per node.
  const nodeToObservationsMap: Record<string, string[]> = {
    classify: ["obs-1"],
  };

  it("lights the node that registers a match, and the enclosing node for one it does not", () => {
    // obs-1 is registered; obs-2 (a nested same-name call) and obs-evt (an
    // EVENT) are in no node's list and resolve to the step around them.
    expect(
      matchedGraphNodeNames({
        matchedObservationIds: new Set(["obs-1", "obs-2", "obs-evt"]),
        nodeToObservationsMap,
        resolution: aggregated,
      }),
    ).toEqual(new Set(["classify"]));
  });

  it("lights nothing when a live query hit nothing", () => {
    // An empty set, not "no search": the graph still dims everything.
    expect(
      matchedGraphNodeNames({
        matchedObservationIds: new Set(),
        nodeToObservationsMap,
        resolution: aggregated,
      }),
    ).toEqual(new Set());
  });

  it("drops a resolved name the graph never laid out", () => {
    expect(
      matchedGraphNodeNames({
        matchedObservationIds: new Set(["obs-evt"]),
        nodeToObservationsMap,
        resolution: { ...aggregated, graphNodeIds: new Set(["respond"]) },
      }),
    ).toEqual(new Set());
  });
});
