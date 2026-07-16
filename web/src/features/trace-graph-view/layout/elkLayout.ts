import type { ELK, ElkNode } from "elkjs";

import {
  type GraphCanvasData,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
} from "../types";
import { measureNode } from "./measureNode";

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge {
  id: string;
  source: string;
  target: string;
  /** Polyline points (start → bend points → end) in layout coordinates. */
  points: { x: number; y: number }[];
}

export interface GraphLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  /** Bounding size of the laid-out graph. */
  width: number;
  height: number;
  /**
   * Set when the graph exceeded the layout budget: ELK was NOT run (it would
   * freeze the tab), `nodes`/`edges` are empty, and the renderer shows a
   * "too large to lay out" notice instead. See MAX_GRAPH_LAYOUT_* below.
   */
  tooLarge?: boolean;
  /** Distinct node / deduped-edge counts — surfaced in the "too large" notice. */
  nodeCount?: number;
  edgeCount?: number;
}

export type GraphLayoutDirection = "DOWN" | "RIGHT";

/**
 * ELK "layered" options for a deterministic DAG. Orthogonal routing + merged
 * edges keep dense traces from turning into a hairball. Direction is
 * per-mode: aggregated graphs read top-down; expanded "as it ran" chains are
 * long and thin, so they lay out left→right like a timeline.
 * @see https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html
 */
const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "org.eclipse.elk.layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.mergeEdges": "true",
  "elk.layered.spacing.nodeNodeBetweenLayers": "52",
  "elk.spacing.nodeNode": "32",
  "elk.spacing.edgeNode": "20",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
};

/**
 * MULTI_EDGE wrapping recurses per layer inside elkjs and a fully sequential
 * expanded trace makes one layer per observation: measured, the recursion
 * stack-overflows around ~1200 layers on small-stack browsers (Firefox) and
 * costs tens of seconds well before that. Above this bound the graph keeps
 * the RIGHT direction but skips wrapping (a plain ribbon lays out in
 * milliseconds at any size).
 */
const MAX_WRAP_NODES = 300;

/**
 * Layout budget for the aggregated (DOWN) graph. Aggregation collapses repeated
 * step names into one node, which turns a large trace into a small-but-DENSE,
 * often CYCLIC multigraph — the pathological input for ELK's layered algorithm
 * (cycle breaking + crossing minimization + orthogonal routing all blow up
 * super-linearly with edge density). Measured with the app's exact layout
 * options on dense cyclic graphs: ~40 nodes/200 edges ≈ 1.4s, 50/250 ≈ 5.8s,
 * 60/300 ≈ 10s, 80/600 ≈ 70s, 100/800 ≈ 177s — and a real reported trace fed
 * ELK 1,422 distinct edges and froze the tab for >110s (indefinite wedge /
 * "too much recursion" on small-stack browsers). elkjs runs synchronously on
 * the main thread, so once started it can't be interrupted or caught — the ONLY
 * safe fix is to not start it. Above the budget we skip layout and the renderer
 * shows a "too large" notice.
 *
 * Sized to sit well below the danger zone (worst-case dense layout at the cap
 * stays a few seconds, never minutes) while leaving large headroom over real
 * aggregated graphs, which have far fewer distinct name-pairs. SPARSE/acyclic
 * graphs of any size are cheap (3,840 acyclic edges lay out in ~0.6s), but the
 * aggregated view rarely reaches this many distinct nodes/edges without also
 * being dense — exactly the case we must protect against.
 *
 * The expanded (RIGHT) path is exempt: it unrolls loops into an ACYCLIC DAG and
 * is already bounded upstream (MAX_EXPANDED_EDGES + the MAX_WRAP_NODES wrapping
 * cap), so it lays out in ~2.5s even at its own limits.
 */
export const MAX_GRAPH_LAYOUT_EDGES = 250;
export const MAX_GRAPH_LAYOUT_NODES = 500;

/**
 * Distinct, self-loop-free edges keyed by (from, to). The aggregated graph
 * hands ELK the same name-pair edge many times over (measured: ~23k raw → ~1.4k
 * distinct, 16×), so deduping before the layout call is the cheapest single win
 * — and gives us the true edge count the budget is measured against.
 *
 * JSON key, not a space-joined one: node ids are SDK-supplied names that
 * commonly contain spaces, so two distinct edges must not collide.
 */
export function dedupeEdges(
  edges: GraphCanvasData["edges"],
): GraphCanvasData["edges"] {
  const seen = new Set<string>();
  const out: GraphCanvasData["edges"] = [];
  for (const edge of edges) {
    if (edge.from === edge.to) continue; // self-loop
    const key = JSON.stringify([edge.from, edge.to]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}

/** Map our {nodes, edges} into an ELK graph. Edges are pre-deduped by the caller. */
function buildElkGraph(
  graph: GraphCanvasData,
  dedupedEdges: GraphCanvasData["edges"],
  counterReserve: Map<string, number>,
  direction: GraphLayoutDirection,
): ElkNode {
  const children = graph.nodes.map((node) => {
    const { width, height } = measureNode(
      node,
      counterReserve.get(node.id) ?? 0,
    );
    // The synthetic anchors mean "the run starts/ends here" — pin them to
    // the first/last layer so edge shape can't strand them mid-graph (e.g.
    // a root span's `root→__end__` edge would otherwise place __end__ in
    // the second column while the run continues to the right of it).
    const constraint =
      node.id === LANGFUSE_START_NODE_NAME ||
      node.id === LANGGRAPH_START_NODE_NAME
        ? "FIRST"
        : node.id === LANGFUSE_END_NODE_NAME ||
            node.id === LANGGRAPH_END_NODE_NAME
          ? "LAST"
          : null;
    return {
      id: node.id,
      width,
      height,
      ...(constraint
        ? {
            layoutOptions: {
              "elk.layered.layering.layerConstraint": constraint,
            },
          }
        : {}),
    };
  });

  const edges = dedupedEdges.map((edge, index) => ({
    id: `edge-${index}`,
    sources: [edge.from],
    targets: [edge.to],
  }));

  return {
    id: "root",
    layoutOptions: {
      ...LAYOUT_OPTIONS,
      "elk.direction": direction,
      // Long expanded chains: let ELK wrap the layer sequence into multiple
      // rows near the panel's aspect ratio, so fit-zoom stays readable
      // instead of shrinking a 1×N ribbon to nothing (bounded — see
      // MAX_WRAP_NODES).
      ...(direction === "RIGHT" && graph.nodes.length <= MAX_WRAP_NODES
        ? {
            "elk.layered.wrapping.strategy": "MULTI_EDGE",
            "elk.aspectRatio": "1.6",
          }
        : {}),
    },
    children,
    edges,
  };
}

let elkInstance: Promise<ELK> | null = null;

/**
 * Lazy-load ELK (~1MB) only when a graph is rendered, and reuse the instance.
 * Runs on the main thread for now; this is the seam to move into a Web Worker
 * for very large graphs without touching callers.
 */
function getElk(): Promise<ELK> {
  if (!elkInstance) {
    elkInstance = import("elkjs/lib/elk.bundled.js").then(
      (mod) => new (mod.default as unknown as { new (): ELK })(),
    );
    // Don't permanently cache a rejected import (transient fetch failure, stale
    // chunk after a deploy) — clear it so the next call retries.
    elkInstance.catch(() => {
      elkInstance = null;
    });
  }
  return elkInstance;
}

/**
 * Reserve extra node width for the observation counter (e.g. " (2/3)") so the
 * suffix isn't ellipsized at render time. Width is based on the stable "(N/N)"
 * form (max digits), not the live index, so cycling never re-runs layout.
 */
function buildCounterReserve(
  nodeToObservationsMap: Record<string, string[]>,
): Map<string, number> {
  const reserve = new Map<string, number>();
  for (const [id, observations] of Object.entries(nodeToObservationsMap)) {
    if (observations.length > 1) {
      reserve.set(
        id,
        ` (${observations.length}/${observations.length})`.length,
      );
    }
  }
  return reserve;
}

/** Compute a deterministic hierarchical layout for the graph via ELK. */
export async function computeGraphLayout(
  graph: GraphCanvasData,
  nodeToObservationsMap: Record<string, string[]> = {},
  direction: GraphLayoutDirection = "DOWN",
): Promise<GraphLayout> {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const dedupedEdges = dedupeEdges(graph.edges);

  // Budget gate (aggregated DOWN layout only — see MAX_GRAPH_LAYOUT_* and the
  // RIGHT-path exemption). elkjs is synchronous and uninterruptible, so a graph
  // past the budget is refused BEFORE the layout call — the only way to avoid a
  // multi-minute main-thread freeze / stack overflow.
  if (
    direction === "DOWN" &&
    (graph.nodes.length > MAX_GRAPH_LAYOUT_NODES ||
      dedupedEdges.length > MAX_GRAPH_LAYOUT_EDGES)
  ) {
    return {
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
      tooLarge: true,
      nodeCount: graph.nodes.length,
      edgeCount: dedupedEdges.length,
    };
  }

  const elk = await getElk();
  const counterReserve = buildCounterReserve(nodeToObservationsMap);
  // Defensive guard around the synchronous elkjs call: a graph that slips past
  // the budget could still throw (e.g. RangeError "too much recursion"). Rethrow
  // so the renderer surfaces a recoverable error state instead of an unhandled
  // rejection.
  let result: ElkNode;
  try {
    result = await elk.layout(
      buildElkGraph(graph, dedupedEdges, counterReserve, direction),
    );
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  const nodes: PositionedNode[] = (result.children ?? []).map((child) => ({
    id: child.id,
    x: child.x ?? 0,
    y: child.y ?? 0,
    width: child.width ?? 0,
    height: child.height ?? 0,
  }));

  const edges: PositionedEdge[] = (result.edges ?? []).flatMap((edge) => {
    const section = edge.sections?.[0];
    if (!section) return [];
    const points = [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ];
    return [
      {
        id: edge.id,
        source: edge.sources?.[0] ?? "",
        target: edge.targets?.[0] ?? "",
        points,
      },
    ];
  });

  return {
    nodes,
    edges,
    width: result.width ?? 0,
    height: result.height ?? 0,
  };
}
