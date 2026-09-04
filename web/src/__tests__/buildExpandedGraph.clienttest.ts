import {
  buildExpandedGraph,
  MAX_EXPANDED_EDGES,
} from "@/src/features/trace-graph-view/buildExpandedGraph";
import {
  type AgentGraphDataResponse,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
} from "@/src/features/trace-graph-view/types";

describe("buildExpandedGraph", () => {
  const obs = (
    overrides: Partial<AgentGraphDataResponse> = {},
  ): AgentGraphDataResponse => ({
    id: "mock-id",
    name: "mock-name",
    node: null,
    step: null,
    parentObservationId: null,
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:00:01.000Z",
    observationType: "AGENT",
    ...overrides,
  });

  const t = (seconds: number) =>
    new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();

  const edgeSet = (result: ReturnType<typeof buildExpandedGraph>) =>
    new Set(result.graph.edges.map((e) => `${e.from}->${e.to}`));

  describe("nodes", () => {
    it("creates one node per observation — repeated names stay distinct", () => {
      const data = [
        obs({ id: "a1", name: "agent", startTime: t(0), endTime: t(10) }),
        obs({ id: "l1", name: "llm", startTime: t(1), endTime: t(2), step: 2 }),
        obs({ id: "l2", name: "llm", startTime: t(3), endTime: t(4), step: 3 }),
        obs({ id: "l3", name: "llm", startTime: t(5), endTime: t(6), step: 4 }),
      ];

      const result = buildExpandedGraph(data);
      const llmNodes = result.graph.nodes.filter((n) => n.label === "llm");

      expect(llmNodes.map((n) => n.id)).toEqual(["l1", "l2", "l3"]);
    });

    it("dedupes duplicate observation ids", () => {
      const data = [
        obs({ id: "a1", name: "agent" }),
        obs({ id: "a1", name: "agent" }),
      ];

      const result = buildExpandedGraph(data);
      const agentNodes = result.graph.nodes.filter((n) => n.id === "a1");

      expect(agentNodes).toHaveLength(1);
    });

    it("replaces incoming system rows with derived start/end anchors", () => {
      const data = [
        obs({
          id: LANGFUSE_START_NODE_NAME,
          name: LANGFUSE_START_NODE_NAME,
          step: 0,
        }),
        obs({ id: "a1", name: "agent", step: 1 }),
        obs({
          id: LANGFUSE_END_NODE_NAME,
          name: LANGFUSE_END_NODE_NAME,
          step: 2,
        }),
      ];

      const result = buildExpandedGraph(data);

      expect(result.graph.nodes.map((n) => n.id)).toEqual([
        LANGFUSE_START_NODE_NAME,
        "a1",
        LANGFUSE_END_NODE_NAME,
      ]);
      expect(edgeSet(result)).toEqual(
        new Set([
          `${LANGFUSE_START_NODE_NAME}->a1`,
          `a1->${LANGFUSE_END_NODE_NAME}`,
        ]),
      );
      // system nodes are not click-selectable observations
      expect(result.nodeToObservationsMap).toEqual({ a1: ["a1"] });
    });
  });

  describe("edges", () => {
    it("chains sequential siblings and descends from the parent", () => {
      const data = [
        obs({ id: "root", name: "root", startTime: t(0), endTime: t(10) }),
        obs({
          id: "l1",
          name: "llm",
          parentObservationId: "root",
          startTime: t(1),
          endTime: t(2),
        }),
        obs({
          id: "l2",
          name: "llm",
          parentObservationId: "root",
          startTime: t(3),
          endTime: t(4),
        }),
      ];

      const result = buildExpandedGraph(data);

      expect(edgeSet(result)).toEqual(
        new Set([
          `${LANGFUSE_START_NODE_NAME}->root`,
          "root->l1",
          "l1->l2",
          // __end__ hangs off the end of the ROOT-level run, not nested leaves
          `root->${LANGFUSE_END_NODE_NAME}`,
        ]),
      );
    });

    it("forks parallel siblings and joins them into the next step", () => {
      const data = [
        obs({ id: "plan", name: "plan", startTime: t(0), endTime: t(1) }),
        obs({ id: "s1", name: "search-a", startTime: t(2), endTime: t(5) }),
        obs({ id: "s2", name: "search-b", startTime: t(2), endTime: t(6) }),
        obs({ id: "sum", name: "summarize", startTime: t(7), endTime: t(8) }),
      ];

      const result = buildExpandedGraph(data);

      expect(edgeSet(result)).toEqual(
        new Set([
          `${LANGFUSE_START_NODE_NAME}->plan`,
          "plan->s1",
          "plan->s2",
          "s1->sum",
          "s2->sum",
          `sum->${LANGFUSE_END_NODE_NAME}`,
        ]),
      );
    });

    it("keeps only direct predecessors (transitive reduction)", () => {
      // a finishes, then b, then c starts: c connects from b only — the
      // a-before-c ordering is implied through b.
      const data = [
        obs({ id: "a", name: "a", startTime: t(0), endTime: t(1) }),
        obs({ id: "b", name: "b", startTime: t(2), endTime: t(3) }),
        obs({ id: "c", name: "c", startTime: t(4), endTime: t(5) }),
      ];

      const result = buildExpandedGraph(data);

      expect(edgeSet(result).has("a->c")).toBe(false);
      expect(edgeSet(result).has("a->b")).toBe(true);
      expect(edgeSet(result).has("b->c")).toBe(true);
    });

    it("walks parent chains through observations missing from the graph", () => {
      // The middle span is not part of the graph data (e.g. filtered out);
      // its child should resolve to the grandparent via the ancestry list.
      const graphData = [
        obs({ id: "root", name: "root", startTime: t(0), endTime: t(10) }),
        obs({
          id: "leaf",
          name: "leaf",
          parentObservationId: "hidden",
          startTime: t(1),
          endTime: t(2),
        }),
      ];
      const ancestry = [
        ...graphData,
        obs({
          id: "hidden",
          name: "hidden",
          parentObservationId: "root",
          startTime: t(1),
          endTime: t(3),
        }),
      ];

      const result = buildExpandedGraph(graphData, ancestry);

      expect(edgeSet(result).has("root->leaf")).toBe(true);
    });

    it("chains through an instant (zero-duration) predecessor instead of orphaning", () => {
      // c1 is instant: the strict happened-before reduction has no "still
      // running at the latest start" predecessor for c2 — the fallback must
      // keep the chain (root→c1→c2), never wire c2 to __start__.
      const data = [
        obs({ id: "root", name: "root", startTime: t(0), endTime: t(10) }),
        obs({
          id: "c1",
          name: "instant",
          parentObservationId: "root",
          startTime: t(1),
          endTime: t(1),
        }),
        obs({
          id: "c2",
          name: "next",
          parentObservationId: "root",
          startTime: t(2),
          endTime: t(3),
        }),
      ];

      const result = buildExpandedGraph(data);

      expect(edgeSet(result).has("c1->c2")).toBe(true);
      expect(edgeSet(result).has(`${LANGFUSE_START_NODE_NAME}->c2`)).toBe(
        false,
      );
    });

    it("chains through a still-running predecessor (no endTime)", () => {
      const data = [
        obs({
          id: "a",
          name: "a",
          startTime: t(0),
          endTime: undefined,
        }),
        obs({ id: "b", name: "b", startTime: t(2), endTime: t(3) }),
      ];

      const result = buildExpandedGraph(data);

      expect(edgeSet(result).has("a->b")).toBe(true);
      expect(edgeSet(result).has(`${LANGFUSE_START_NODE_NAME}->b`)).toBe(false);
    });

    it("keeps the edge of an instant that ran alongside a longer sibling", () => {
      // The instant's own start is the latest start among the predecessors —
      // the reduction must compare each predecessor against the OTHERS'
      // starts, or the instant's edge is dropped and it dangles as a false
      // sink while the successor loses a real ordering edge.
      const data = [
        obs({ id: "a", name: "long", startTime: t(0), endTime: t(5) }),
        obs({ id: "i", name: "instant", startTime: t(3), endTime: t(3) }),
        obs({ id: "c", name: "next", startTime: t(6), endTime: t(7) }),
      ];

      const result = buildExpandedGraph(data);

      // both predecessors are direct (neither fits entirely after the other)
      expect(edgeSet(result).has("a->c")).toBe(true);
      expect(edgeSet(result).has("i->c")).toBe(true);
      expect(edgeSet(result).has(`i->${LANGFUSE_END_NODE_NAME}`)).toBe(false);
    });

    it("chains a same-start instant through its longer sibling instead of orphaning it", () => {
      // b (instant) shares a's start and ends before a's start — the
      // happened-before b→a must be emitted (end tiebreak in the run-order
      // sort), so the reduction may legitimately drop b→c as implied via
      // b→a→c. Without the tiebreak b sorted after a, b→a was never
      // considered, and b dangled as a disconnected __start__→b→__end__.
      const data = [
        obs({ id: "a", name: "long", startTime: t(0), endTime: t(5) }),
        obs({ id: "b", name: "instant", startTime: t(0), endTime: t(0) }),
        obs({ id: "c", name: "next", startTime: t(10), endTime: t(15) }),
      ];

      const result = buildExpandedGraph(data);

      expect(edgeSet(result)).toEqual(
        new Set([
          `${LANGFUSE_START_NODE_NAME}->b`,
          "b->a",
          "a->c",
          `c->${LANGFUSE_END_NODE_NAME}`,
        ]),
      );
    });

    it("chains same-timestamp instants singly instead of quadratically", () => {
      const data = ["s1", "s2", "s3"].map((id) =>
        obs({ id, name: id, startTime: t(1), endTime: t(1) }),
      );

      const result = buildExpandedGraph(data);

      expect(edgeSet(result).has("s1->s2")).toBe(true);
      expect(edgeSet(result).has("s2->s3")).toBe(true);
      expect(edgeSet(result).has("s1->s3")).toBe(false);
    });

    it("treats unresolvable parents as root-level", () => {
      // LangGraph shape: node observations whose parent (the trace root span)
      // is filtered out of the graph entirely → they chain at root level.
      const data = [
        obs({
          id: "n1",
          name: "planner",
          parentObservationId: "gone",
          startTime: t(0),
          endTime: t(1),
        }),
        obs({
          id: "n2",
          name: "retriever",
          parentObservationId: "gone",
          startTime: t(2),
          endTime: t(3),
        }),
      ];

      const result = buildExpandedGraph(data);

      expect(edgeSet(result)).toEqual(
        new Set([
          `${LANGFUSE_START_NODE_NAME}->n1`,
          "n1->n2",
          `n2->${LANGFUSE_END_NODE_NAME}`,
        ]),
      );
    });
  });

  it("bails with limitExceeded when parallel batches explode the edge count", () => {
    // A join of 110 parallel siblings into 110 parallel successors is
    // all-to-all (12100 edges), past the budget: the builder must bail
    // instead of freezing ELK.
    const data = [
      ...Array.from({ length: 110 }, (_, i) =>
        obs({ id: `a${i}`, name: `a${i}`, startTime: t(0), endTime: t(100) }),
      ),
      ...Array.from({ length: 110 }, (_, i) =>
        obs({
          id: `b${i}`,
          name: `b${i}`,
          startTime: t(200),
          endTime: t(300),
        }),
      ),
    ];

    const result = buildExpandedGraph(data);

    expect(110 * 110).toBeGreaterThan(MAX_EXPANDED_EDGES);
    expect(result.limitExceeded).toBe(true);
    expect(result.graph.nodes).toEqual([]);
    expect(result.graph.edges).toEqual([]);
  });

  it("keeps a maximal linear chain under the edge budget", () => {
    // 5000 sequential calls (the panel's observation cap) are ~5000 linear
    // edges — a legitimate shape that must render, not bail.
    const n = 5000;
    const data = Array.from({ length: n }, (_, i) =>
      obs({
        id: `o${i}`,
        name: "call",
        startTime: t(i * 2),
        endTime: t(i * 2 + 1),
      }),
    );

    const result = buildExpandedGraph(data);

    expect(result.limitExceeded).toBeUndefined();
    expect(result.graph.nodes).toHaveLength(n + 2);
  });

  it("returns an identity observation map", () => {
    const data = [
      obs({ id: "a", name: "a", step: 1 }),
      obs({ id: "b", name: "b", step: 2 }),
    ];

    const result = buildExpandedGraph(data);

    expect(result.nodeToObservationsMap).toEqual({ a: ["a"], b: ["b"] });
  });

  it("returns an empty graph for empty input", () => {
    expect(buildExpandedGraph([])).toEqual({
      graph: { nodes: [], edges: [] },
      nodeToObservationsMap: {},
    });
  });
});
