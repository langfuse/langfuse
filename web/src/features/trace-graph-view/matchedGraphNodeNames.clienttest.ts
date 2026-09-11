// @vitest-environment jsdom

import { matchedGraphNodeNames } from "./matchedGraphNodeNames";

const map: Record<string, string[]> = {
  __start__: [],
  classify: ["obs-1", "obs-2", "obs-3"],
  respond: ["obs-4"],
  cleanup: ["obs-5"],
  __end__: [],
};

describe("matchedGraphNodeNames", () => {
  it("lights a node when any one of its observations matched", () => {
    // The aggregated view collapses every call of a step into one node, so one
    // hit among three calls is still a hit on the node.
    expect(matchedGraphNodeNames(map, new Set(["obs-3"]))).toEqual(
      new Set(["classify"]),
    );
  });

  it("lights every node that owns a match, and only those", () => {
    expect(matchedGraphNodeNames(map, new Set(["obs-2", "obs-5"]))).toEqual(
      new Set(["classify", "cleanup"]),
    );
  });

  it("lights nothing when a live query hit nothing", () => {
    // Empty, not "no search" — the caller still dims the whole graph.
    expect(matchedGraphNodeNames(map, new Set())).toEqual(new Set());
  });

  it("never lights the synthetic start and end markers", () => {
    // They stand for no observation, so no query can be about them.
    const all = new Set(["obs-1", "obs-2", "obs-3", "obs-4", "obs-5"]);
    const lit = matchedGraphNodeNames(map, all);
    expect(lit.has("__start__")).toBe(false);
    expect(lit.has("__end__")).toBe(false);
    expect(lit).toEqual(new Set(["classify", "respond", "cleanup"]));
  });

  it("ignores matched observations that no node owns", () => {
    // An observation can match while being filtered out of the graph.
    expect(matchedGraphNodeNames(map, new Set(["obs-not-in-graph"]))).toEqual(
      new Set(),
    );
  });
});
