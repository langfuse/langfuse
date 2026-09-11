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

describe("nearestGraphNodeName", () => {
  it("returns the observation's own step name when it has one", () => {
    expect(nearestGraphNodeName("obs-2", aggregated)).toBe("classify");
  });

  it("walks up to the nearest ancestor carrying a step name", () => {
    // The EVENT itself is not in the graph; its enclosing step is.
    expect(nearestGraphNodeName("obs-evt", aggregated)).toBe("classify");
  });

  it("walks up to the nearest ancestor that IS a node, in expanded mode", () => {
    expect(nearestGraphNodeName("obs-evt", expanded)).toBe("obs-1");
  });

  it("returns null when nothing up the chain has a node", () => {
    expect(nearestGraphNodeName("obs-orphan", aggregated)).toBeNull();
    expect(nearestGraphNodeName("not-an-observation", aggregated)).toBeNull();
  });

  it("survives a cycle in the parent references", () => {
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
  const nodeToObservationsMap: Record<string, string[]> = {
    __start__: [],
    classify: ["obs-1"],
    respond: ["obs-9"],
    __end__: [],
  };

  it("lights a node when the observation it registers matched", () => {
    expect(
      matchedGraphNodeNames({
        matchedObservationIds: new Set(["obs-1"]),
        nodeToObservationsMap,
        resolution: aggregated,
      }),
    ).toEqual(new Set(["classify"]));
  });

  it("lights the enclosing node for a match the map does not register", () => {
    // A nested same-name call and an EVENT: neither is in
    // nodeToObservationsMap, and both used to light nothing at all.
    expect(
      matchedGraphNodeNames({
        matchedObservationIds: new Set(["obs-2", "obs-evt"]),
        nodeToObservationsMap,
        resolution: aggregated,
      }),
    ).toEqual(new Set(["classify"]));
  });

  it("lights several nodes when several own a match", () => {
    expect(
      matchedGraphNodeNames({
        matchedObservationIds: new Set(["obs-evt", "obs-9"]),
        nodeToObservationsMap,
        resolution: aggregated,
      }),
    ).toEqual(new Set(["classify", "respond"]));
  });

  it("lights nothing when a live query hit nothing", () => {
    expect(
      matchedGraphNodeNames({
        matchedObservationIds: new Set(),
        nodeToObservationsMap,
        resolution: aggregated,
      }),
    ).toEqual(new Set());
  });

  it("never lights the synthetic start and end markers", () => {
    // They stand for no observation, so no query can be about them.
    const lit = matchedGraphNodeNames({
      matchedObservationIds: new Set(["obs-1", "obs-2", "obs-evt", "obs-9"]),
      nodeToObservationsMap,
      resolution: aggregated,
    });
    expect(lit.has("__start__")).toBe(false);
    expect(lit.has("__end__")).toBe(false);
  });

  it("drops a resolved name the graph never laid out", () => {
    const resolution: GraphNodeResolution = {
      ...aggregated,
      graphNodeIds: new Set(["respond"]),
    };
    expect(
      matchedGraphNodeNames({
        matchedObservationIds: new Set(["obs-evt"]),
        nodeToObservationsMap,
        resolution,
      }),
    ).toEqual(new Set());
  });

  it("ignores matched observations no node and no ancestor owns", () => {
    expect(
      matchedGraphNodeNames({
        matchedObservationIds: new Set(["obs-orphan"]),
        nodeToObservationsMap,
        resolution: aggregated,
      }),
    ).toEqual(new Set());
  });
});
