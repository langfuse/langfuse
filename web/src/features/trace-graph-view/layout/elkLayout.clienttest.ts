import { type GraphCanvasData, type GraphNodeData } from "../types";
import { computeGraphLayout } from "./elkLayout";

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
