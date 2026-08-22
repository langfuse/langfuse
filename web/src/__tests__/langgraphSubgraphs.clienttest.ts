import {
  parseLanggraphCheckpointPath,
  qualifyLanggraphNodes,
  hasNestedLanggraphSubgraphs,
  findSubgraphHostIds,
} from "@/src/features/trace-graph-view/langgraphSubgraphs";
import {
  buildGraphFromStepData,
  transformLanggraphToGeneralized,
} from "@/src/features/trace-graph-view/buildGraphCanvasData";
import {
  type AgentGraphDataResponse,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
} from "@/src/features/trace-graph-view/types";

describe("langgraph subgraph graph parsing (#8078)", () => {
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
    checkpointNs: null,
    ...overrides,
  });

  const edgeSet = (edges: { from: string; to: string }[]) =>
    new Set(edges.map((e) => `${e.from}->${e.to}`));

  describe("parseLanggraphCheckpointPath", () => {
    it("strips UUIDs and splits nested namespaces", () => {
      expect(parseLanggraphCheckpointPath("")).toEqual([]);
      expect(parseLanggraphCheckpointPath(null)).toEqual([]);
      expect(parseLanggraphCheckpointPath("planner:abc-uuid")).toEqual([
        "planner",
      ]);
      expect(
        parseLanggraphCheckpointPath("research_team:abc|search:def"),
      ).toEqual(["research_team", "search"]);
    });
  });

  describe("qualifyLanggraphNodes", () => {
    it("path-qualifies nested subgraph nodes", () => {
      const data = [
        obs({
          id: "host",
          node: "research_team",
          step: 1,
          checkpointNs: "research_team:aaa",
        }),
        obs({
          id: "search",
          node: "search",
          step: 1,
          checkpointNs: "research_team:aaa|search:bbb",
        }),
        obs({
          id: "analyze",
          node: "analyze",
          step: 2,
          checkpointNs: "research_team:aaa|analyze:ccc",
        }),
        obs({
          id: "summarize",
          node: "summarize",
          step: 2,
          checkpointNs: "summarize:ddd",
        }),
      ];

      expect(hasNestedLanggraphSubgraphs(data)).toBe(true);

      const qualified = qualifyLanggraphNodes(data);
      expect(qualified.map((o) => o.node)).toEqual([
        "research_team",
        "research_team/search",
        "research_team/analyze",
        "summarize",
      ]);
      expect(findSubgraphHostIds(qualified)).toEqual(
        new Set(["research_team"]),
      );
    });

    it("keeps identically named nodes in sibling subgraphs distinct", () => {
      const data = [
        obs({
          id: "a1",
          node: "agent",
          step: 1,
          checkpointNs: "researcher:aaa|agent:bbb",
        }),
        obs({
          id: "a2",
          node: "agent",
          step: 1,
          checkpointNs: "writer:ccc|agent:ddd",
        }),
      ];

      const qualified = qualifyLanggraphNodes(data);
      expect(qualified.map((o) => o.node)).toEqual([
        "researcher/agent",
        "writer/agent",
      ]);
    });

    it("path-qualifies nested __start__/__end__ instead of promoting them to root", () => {
      const data = [
        obs({
          id: "root-start",
          node: "__start__",
          step: 0,
          checkpointNs: "",
        }),
        obs({
          id: "nested-start",
          node: "__start__",
          step: 0,
          checkpointNs: "research_team:aaa",
        }),
        obs({
          id: "nested-end",
          node: "__end__",
          step: 3,
          checkpointNs: "research_team:aaa|__end__:bbb",
        }),
        obs({
          id: "search",
          node: "search",
          step: 1,
          checkpointNs: "research_team:aaa|search:ccc",
        }),
      ];

      const qualified = qualifyLanggraphNodes(data);
      expect(qualified.map((o) => o.node)).toEqual([
        "__start__",
        "research_team/__start__",
        "research_team/__end__",
        "research_team/search",
      ]);
    });
  });

  describe("transform + buildGraphFromStepData", () => {
    it("shows nested subgraph nodes and stitches them into the parent flow", () => {
      // Parent: research_team (subgraph) → summarize
      // Subgraph: search → analyze
      // Without the fix, local step counters collide (both graphs restart at 1)
      // and nested nodes either merge with parent siblings or disappear.
      const data = [
        obs({
          id: "host",
          name: "research_team",
          node: "research_team",
          step: 1,
          checkpointNs: "research_team:aaa",
          startTime: "2026-01-01T00:00:01.000Z",
          endTime: "2026-01-01T00:00:04.000Z",
        }),
        obs({
          id: "search",
          name: "search",
          node: "search",
          step: 1,
          checkpointNs: "research_team:aaa|search:bbb",
          startTime: "2026-01-01T00:00:01.100Z",
          endTime: "2026-01-01T00:00:02.000Z",
        }),
        obs({
          id: "analyze",
          name: "analyze",
          node: "analyze",
          step: 2,
          checkpointNs: "research_team:aaa|analyze:ccc",
          startTime: "2026-01-01T00:00:02.100Z",
          endTime: "2026-01-01T00:00:03.500Z",
        }),
        obs({
          id: "summarize",
          name: "summarize",
          node: "summarize",
          step: 2,
          checkpointNs: "summarize:ddd",
          startTime: "2026-01-01T00:00:04.100Z",
          endTime: "2026-01-01T00:00:05.000Z",
        }),
      ];

      const normalized = transformLanggraphToGeneralized(data);
      const { graph } = buildGraphFromStepData(normalized);

      const nodeIds = graph.nodes
        .map((n) => n.id)
        .filter((id) => !id.startsWith("__"))
        .sort();

      // Subgraph internals are present; the host wrapper is replaced by them.
      expect(nodeIds).toEqual([
        "research_team/analyze",
        "research_team/search",
        "summarize",
      ]);
      expect(nodeIds).not.toContain("research_team");

      const edges = edgeSet(graph.edges);
      expect(
        edges.has(`${LANGFUSE_START_NODE_NAME}->research_team/search`),
      ).toBe(true);
      expect(edges.has("research_team/search->research_team/analyze")).toBe(
        true,
      );
      expect(edges.has("research_team/analyze->summarize")).toBe(true);
      expect(edges.has(`summarize->${LANGFUSE_END_NODE_NAME}`)).toBe(true);

      // Must NOT collapse nested step-1 with parent step-1 into a bogus parallel
      // edge from search straight to summarize (skipping analyze), which is what
      // the flat global step map did before this fix.
      expect(edges.has("research_team/search->summarize")).toBe(false);
    });

    it("does not change flat (non-nested) LangGraph traces", () => {
      const data = [
        obs({
          id: "planner",
          name: "planner",
          node: "planner",
          step: 1,
          checkpointNs: "planner:aaa",
        }),
        obs({
          id: "executor",
          name: "executor",
          node: "executor",
          step: 2,
          checkpointNs: "executor:bbb",
        }),
      ];

      expect(hasNestedLanggraphSubgraphs(data)).toBe(false);

      const normalized = transformLanggraphToGeneralized(data);
      const { graph } = buildGraphFromStepData(normalized);
      const edges = edgeSet(graph.edges);

      expect(
        graph.nodes
          .map((n) => n.id)
          .filter((id) => !id.startsWith("__"))
          .sort(),
      ).toEqual(["executor", "planner"]);
      expect(edges.has("planner->executor")).toBe(true);
    });

    it("drops nested __start__/__end__ so they do not corrupt root step edges", () => {
      const data = [
        obs({
          id: "host",
          name: "research_team",
          node: "research_team",
          step: 1,
          checkpointNs: "research_team:aaa",
        }),
        obs({
          id: "nested-start",
          name: "__start__",
          node: "__start__",
          step: 0,
          // Same local step as a parent-scope node would collide if promoted.
          checkpointNs: "research_team:aaa",
        }),
        obs({
          id: "search",
          name: "search",
          node: "search",
          step: 1,
          checkpointNs: "research_team:aaa|search:bbb",
        }),
        obs({
          id: "nested-end",
          name: "__end__",
          node: "__end__",
          step: 2,
          checkpointNs: "research_team:aaa|__end__:ccc",
        }),
        obs({
          id: "summarize",
          name: "summarize",
          node: "summarize",
          step: 2,
          checkpointNs: "summarize:ddd",
        }),
      ];

      const normalized = transformLanggraphToGeneralized(data);
      expect(
        normalized.filter(
          (o) =>
            o.node === "__start__" ||
            o.node === "__end__" ||
            o.node?.endsWith("/__start__") ||
            o.node?.endsWith("/__end__"),
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ node: LANGFUSE_START_NODE_NAME }),
          expect.objectContaining({ node: LANGFUSE_END_NODE_NAME }),
        ]),
      );
      // Nested anchors must not survive as path-qualified nodes either.
      expect(
        normalized.some(
          (o) => o.node?.endsWith("/__start__") || o.node?.endsWith("/__end__"),
        ),
      ).toBe(false);

      const { graph } = buildGraphFromStepData(normalized);
      const edges = edgeSet(graph.edges);
      expect(edges.has("research_team/search->summarize")).toBe(true);
      // Nested end at local step 2 must not sit beside summarize in the root map.
      expect(
        graph.nodes.some(
          (n) => n.id.endsWith("/__start__") || n.id.endsWith("/__end__"),
        ),
      ).toBe(false);
    });

    it("keeps flat step edges for node names that contain slashes", () => {
      // A LangGraph node can be named "router/tool" without being a subgraph.
      // Slash-in-name must not trigger the scoped builder.
      const data = [
        obs({
          id: "router",
          name: "router/tool",
          node: "router/tool",
          step: 1,
          checkpointNs: "router/tool:aaa",
        }),
        obs({
          id: "writer",
          name: "writer",
          node: "writer",
          step: 2,
          checkpointNs: "writer:bbb",
        }),
      ];

      expect(hasNestedLanggraphSubgraphs(data)).toBe(false);

      const normalized = transformLanggraphToGeneralized(data);
      const { graph } = buildGraphFromStepData(normalized);
      const edges = edgeSet(graph.edges);

      expect(
        graph.nodes
          .map((n) => n.id)
          .filter((id) => !id.startsWith("__"))
          .sort(),
      ).toEqual(["router/tool", "writer"]);
      expect(edges.has("router/tool->writer")).toBe(true);
      // Scoped builder would orphan these onto synthetic anchors instead.
      expect(edges.has(`${LANGFUSE_START_NODE_NAME}->router/tool`)).toBe(true);
      expect(edges.has(`writer->${LANGFUSE_END_NODE_NAME}`)).toBe(true);
    });
  });
});
