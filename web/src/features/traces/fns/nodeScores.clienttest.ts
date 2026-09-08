// @vitest-environment node

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

  it("finds TRACE owners below a synthetic SESSION root", () => {
    expect([
      ...traceLevelScoreOwnerIds([
        {
          id: "session-s",
          type: "SESSION",
          children: [
            { id: "trace-t1", type: "TRACE" },
            { id: "trace-t2", type: "TRACE" },
          ],
        },
      ]),
    ]).toEqual(["trace-t1", "trace-t2"]);
  });

  it("does not hand ownership to a row that only LOOKS top-level", () => {
    // An observation merged in from outside the loaded list, whose parent is
    // missing too, sits among the roots without being one. In v4 (no TRACE row)
    // the roots stand in for the trace, so leaving it in would give it the
    // trace's scores and root-only chrome.
    const rootsWithImpostor = roots(
      { id: "root", type: "SPAN" },
      { id: "detached", type: "SPAN" },
    );

    expect([...traceLevelScoreOwnerIds(rootsWithImpostor, "detached")]).toEqual(
      ["root"],
    );
    // A genuine root that merely fell past the cap keeps root semantics.
    expect(
      traceLevelScoreOwnerIds(rootsWithImpostor, null).has("detached"),
    ).toBe(true);
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

  it("keeps scores on their owning trace in a session tree", () => {
    const sessionScores = [
      { id: "t1", traceId: "trace-1", observationId: null },
      { id: "o1", traceId: "trace-1", observationId: "shared" },
      { id: "t2", traceId: "trace-2", observationId: null },
      { id: "o2", traceId: "trace-2", observationId: "shared" },
    ];
    const sessionOwners = traceLevelScoreOwnerIds(
      roots(
        { id: "trace-trace-1", type: "TRACE" },
        { id: "trace-trace-2", type: "TRACE" },
      ),
    );

    expect(
      selectNodeScores(
        sessionScores,
        "trace-trace-2",
        sessionOwners,
        "trace-2",
      ).map((score) => score.id),
    ).toEqual(["t2"]);
    expect(
      selectNodeScores(sessionScores, "shared", sessionOwners, "trace-2").map(
        (score) => score.id,
      ),
    ).toEqual(["o2"]);
  });
});
