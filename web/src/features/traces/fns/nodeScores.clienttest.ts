import { selectNodeScores, traceLevelScoreOwnerIds } from "./nodeScores";

const roots = (
  ...nodes: { id: string; type: "TRACE" | "SPAN" }[]
): { id: string; type: "TRACE" | "SPAN" }[] => nodes;

const scores = [
  { id: "trace-level", observationId: null },
  { id: "root-level", observationId: "root" },
  { id: "child-level", observationId: "child" },
];

describe("traceLevelScoreOwnerIds", () => {
  it("owns trace-level scores on the TRACE row, else on every top-level span", () => {
    // v3: the TRACE wrapper owns them, its root observations do not.
    expect([
      ...traceLevelScoreOwnerIds(
        roots({ id: "trace", type: "TRACE" }, { id: "root", type: "SPAN" }),
      ),
    ]).toEqual(["trace"]);

    // v4: no TRACE row, so every top-level span stands in for the trace.
    expect([
      ...traceLevelScoreOwnerIds(
        roots({ id: "root", type: "SPAN" }, { id: "orphan", type: "SPAN" }),
      ),
    ]).toEqual(["root", "orphan"]);
  });

  it("is input-sensitive: level-filtered roots would hand ownership to a promoted child", () => {
    // A level filter that hides "root" promotes "child" to the top of the
    // rendered tree. Ownership must come from the structural roots, or a
    // non-root span starts claiming the trace's scores.
    const structuralRoots = roots({ id: "root", type: "SPAN" });
    const levelFilteredRoots = roots({ id: "child", type: "SPAN" });

    expect(traceLevelScoreOwnerIds(structuralRoots).has("child")).toBe(false);
    expect(traceLevelScoreOwnerIds(levelFilteredRoots).has("child")).toBe(true);
  });
});

describe("selectNodeScores", () => {
  const ownerIds = traceLevelScoreOwnerIds(roots({ id: "root", type: "SPAN" }));

  it("adds trace-level scores to the owner once and leaves other nodes alone", () => {
    expect(selectNodeScores(scores, "root", ownerIds).map((s) => s.id)).toEqual(
      ["trace-level", "root-level"],
    );
    expect(
      selectNodeScores(scores, "child", ownerIds).map((s) => s.id),
    ).toEqual(["child-level"]);
  });
});
