import { type GraphCanvasData, type GraphNodeData } from "../types";
import {
  computeGraphLayout,
  dedupeEdges,
  MAX_GRAPH_LAYOUT_EDGES,
  MAX_GRAPH_LAYOUT_NODES,
} from "./elkLayout";

const node = (id: string): GraphNodeData => ({ id, label: id, type: "AGENT" });

describe("computeGraphLayout", () => {
  it("dedupes duplicate edges into a single positioned edge", async () => {
    const graph: GraphCanvasData = {
      nodes: [node("a"), node("b")],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "b" },
      ],
    };

    const layout = await computeGraphLayout(graph);

    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]).toMatchObject({ source: "a", target: "b" });
  });

  it("keeps distinct edges whose dedupe keys would collide when space-joined", async () => {
    // Node ids are SDK-supplied names that may contain spaces: a naive
    // space-joined key would collapse ("a b" → "c") and ("a" → "b c").
    const graph: GraphCanvasData = {
      nodes: [node("a b"), node("c"), node("a"), node("b c")],
      edges: [
        { from: "a b", to: "c" },
        { from: "a", to: "b c" },
      ],
    };

    const layout = await computeGraphLayout(graph);

    expect(layout.edges).toHaveLength(2);
    const pairs = layout.edges.map((edge) => [edge.source, edge.target]);
    expect(pairs).toContainEqual(["a b", "c"]);
    expect(pairs).toContainEqual(["a", "b c"]);
  });

  it("drops self-loops but still lays out the node", async () => {
    const graph: GraphCanvasData = {
      nodes: [node("x")],
      edges: [{ from: "x", to: "x" }],
    };

    const layout = await computeGraphLayout(graph);

    expect(layout.edges).toHaveLength(0);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].id).toBe("x");
    expect(layout.nodes[0].width).toBeGreaterThan(0);
  });

  it("reserves extra node width for the observation counter", async () => {
    const graph: GraphCanvasData = {
      nodes: [node("important-node")],
      edges: [],
    };

    const single = await computeGraphLayout(graph, {
      "important-node": ["obs-1"],
    });
    const multi = await computeGraphLayout(graph, {
      "important-node": ["obs-1", "obs-2", "obs-3"],
    });

    const singleWidth = single.nodes.find(
      (n) => n.id === "important-node",
    )!.width;
    const multiWidth = multi.nodes.find(
      (n) => n.id === "important-node",
    )!.width;
    expect(multiWidth).toBeGreaterThan(singleWidth);
  });
});

describe("dedupeEdges", () => {
  it("collapses duplicate (from,to) pairs and drops self-loops", () => {
    const result = dedupeEdges([
      { from: "a", to: "b" },
      { from: "a", to: "b" },
      { from: "b", to: "a" }, // reverse is distinct
      { from: "c", to: "c" }, // self-loop
    ]);
    expect(result).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ]);
  });

  it("does not collide edges whose ids would merge when space-joined", () => {
    const result = dedupeEdges([
      { from: "a b", to: "c" },
      { from: "a", to: "b c" },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("computeGraphLayout layout budget", () => {
  // A dense cyclic aggregated graph freezes ELK (measured: 100 nodes/800 edges
  // ≈ 177s on the main thread, a real trace fed ~1,400 edges froze >110s). ELK
  // is synchronous, so the only safe fix is to refuse the layout up front.

  // `edgeCount` distinct directed edges among the first `nodeCount` node ids
  // (no self-loops) — a dense graph, but edge endpoints stay within the nodes.
  const denseEdges = (
    nodeCount: number,
    edgeCount: number,
  ): GraphCanvasData["edges"] => {
    const edges: GraphCanvasData["edges"] = [];
    for (let a = 0; a < nodeCount && edges.length < edgeCount; a++) {
      for (let b = 0; b < nodeCount && edges.length < edgeCount; b++) {
        if (a !== b) edges.push({ from: `n${a}`, to: `n${b}` });
      }
    }
    return edges;
  };

  // A sparse acyclic chain of `edgeCount` edges over edgeCount+1 nodes — lays
  // out in milliseconds even past the edge budget, so boundary/exempt cases
  // stay fast.
  const chain = (edgeCount: number): GraphCanvasData => ({
    nodes: Array.from({ length: edgeCount + 1 }, (_, i) => node(`n${i}`)),
    edges: Array.from({ length: edgeCount }, (_, i) => ({
      from: `n${i}`,
      to: `n${i + 1}`,
    })),
  });

  it("refuses an over-budget aggregated (DOWN) graph without running ELK", async () => {
    const count = MAX_GRAPH_LAYOUT_EDGES + 10;
    const nodes = Array.from({ length: 60 }, (_, i) => node(`n${i}`));
    const graph: GraphCanvasData = { nodes, edges: denseEdges(60, count) };

    // If ELK actually ran on this dense graph the test would hang for minutes;
    // the budget must make it return near-instantly.
    const start = Date.now();
    const layout = await computeGraphLayout(graph, {}, "DOWN");
    expect(Date.now() - start).toBeLessThan(1000);

    expect(layout.tooLarge).toBe(true);
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
    expect(layout.edgeCount).toBe(count);
  });

  it("refuses an aggregated graph with too many nodes", async () => {
    const nodes = Array.from({ length: MAX_GRAPH_LAYOUT_NODES + 1 }, (_, i) =>
      node(`n${i}`),
    );
    const graph: GraphCanvasData = {
      nodes,
      edges: [{ from: "n0", to: "n1" }],
    };

    const layout = await computeGraphLayout(graph, {}, "DOWN");
    expect(layout.tooLarge).toBe(true);
    expect(layout.nodeCount).toBe(MAX_GRAPH_LAYOUT_NODES + 1);
  });

  it("lays out a DOWN graph exactly AT the edge budget (the > boundary)", async () => {
    // The gate is strictly greater-than, so exactly MAX edges is allowed.
    const layout = await computeGraphLayout(
      chain(MAX_GRAPH_LAYOUT_EDGES),
      {},
      "DOWN",
    );
    expect(layout.tooLarge).toBeFalsy();
    expect(layout.nodes.length).toBeGreaterThan(0);
  });

  it("lays out a DOWN graph exactly AT the node budget (the > boundary)", async () => {
    const nodes = Array.from({ length: MAX_GRAPH_LAYOUT_NODES }, (_, i) =>
      node(`n${i}`),
    );
    // Sparse (well under the edge budget) so ELK stays fast.
    const edges = Array.from({ length: 20 }, (_, i) => ({
      from: `n${i}`,
      to: `n${i + 1}`,
    }));
    const layout = await computeGraphLayout({ nodes, edges }, {}, "DOWN");
    expect(layout.tooLarge).toBeFalsy();
    expect(layout.nodes).toHaveLength(MAX_GRAPH_LAYOUT_NODES);
  });

  it("does not flag a small DOWN graph as too large", async () => {
    const graph: GraphCanvasData = {
      nodes: [node("a"), node("b"), node("c")],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };
    const layout = await computeGraphLayout(graph, {}, "DOWN");
    expect(layout.tooLarge).toBeFalsy();
    expect(layout.nodes).toHaveLength(3);
  });

  it("still lays out an over-budget expanded (RIGHT) chain — exempt from the budget", async () => {
    // Expanded graphs are acyclic and bounded upstream; a long thin chain of
    // more than MAX_GRAPH_LAYOUT_EDGES edges lays out in milliseconds.
    const layout = await computeGraphLayout(
      chain(MAX_GRAPH_LAYOUT_EDGES + 5),
      {},
      "RIGHT",
    );
    expect(layout.tooLarge).toBeFalsy();
    expect(layout.nodes.length).toBeGreaterThan(0);
  });
});
