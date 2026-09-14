import type { ELK, ElkNode } from "elkjs";

import {
  type GraphCanvasData,
  type GraphNodeData,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
} from "../types";
import { measureNode } from "./measureNode";

interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PositionedEdge {
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
   * Set when the graph got no layout: past the count ceiling
   * (MAX_GRAPH_LAYOUT_*, so ELK never ran), past the worker's wall-clock
   * deadline, or elkjs overflowed its call stack on a graph still inside the
   * count budget (deep/cyclic layered graphs). `nodes`/`edges` are empty and
   * the renderer shows a "too large to lay out" notice.
   */
  tooLarge?: boolean;
  /** Distinct node / deduped-edge counts — surfaced in the "too large" notice. */
  nodeCount?: number;
  edgeCount?: number;
}

export type GraphLayoutDirection = "DOWN" | "RIGHT";

/**
 * Everything ELK needs, and nothing else — this crosses the worker boundary, and
 * `postMessage`'s structured clone is synchronous main-thread work. Edges are
 * deduped and the observation map is reduced to per-node counter widths BEFORE
 * the post, so we never clone the raw multigraph or the full id lists.
 */
export interface GraphLayoutRequest {
  nodes: GraphNodeData[];
  edges: GraphCanvasData["edges"];
  /** [nodeId, extra label chars] — see buildCounterReserve. */
  counterReserve: [string, number][];
  direction: GraphLayoutDirection;
}

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
 *
 * Layout now runs in a Worker, whose stack is SMALLER than the main thread's —
 * measured, a deep aggregated graph overflows around 500 layers there — so this
 * bound stays conservative rather than being relaxed.
 */
const MAX_WRAP_NODES = 300;

/**
 * Count ceiling for the aggregated (DOWN) graph — a memory and sanity bound, NOT
 * a time budget. Layout cost tracks graph SHAPE far more than size: measured with
 * these exact options at identical counts, 60 nodes / 300 edges lay out in ~0.35s
 * when the edges concentrate on a few nodes and ~16s when they are spread
 * uniformly (aggregation collapses repeated step names, which is what turns a
 * large trace into a small-but-dense, often cyclic multigraph — the pathological
 * input for the layered algorithm). No count can predict that, so the real budget
 * is the wall-clock GRAPH_LAYOUT_DEADLINE_MS enforced by the layout worker's
 * client; ELK stays uninterruptible even in a worker, hence a ceiling as well.
 *
 * Sized from the sparse case, which is what real aggregated graphs at this scale
 * look like: 2,500 nodes / 2,499 edges lay out in ~0.45s using ~88MB. Edges are
 * the expensive dimension (dense 1,000 / 3,000 ≈ 27s), so they get the tighter
 * number; dense graphs inside the ceiling hit the deadline instead and get the
 * "too large" notice — a graph the previous 250-edge budget refused outright now
 * usually renders.
 *
 * The expanded (RIGHT) path is exempt: it unrolls loops into an ACYCLIC DAG and
 * is already bounded upstream (MAX_EXPANDED_EDGES + the MAX_WRAP_NODES wrapping
 * cap), so it lays out in ~2.5s even at its own limits.
 */
export const MAX_GRAPH_LAYOUT_EDGES = 2_000;
export const MAX_GRAPH_LAYOUT_NODES = 2_500;

/**
 * Ceiling for a layout that must run on the CALLING thread — no Worker support, or
 * the worker script failed to load. A wall-clock deadline is structurally
 * impossible there (synchronous ELK cannot be interrupted), so counts are the only
 * protection left, and these are deliberately the PRE-worker numbers: that path
 * behaves exactly as the app did before layout moved off the main thread, RIGHT
 * exemption included. Without this, the raised ceiling above would let a dense
 * graph freeze the tab for minutes on the fallback path.
 */
const MAX_MAIN_THREAD_LAYOUT_EDGES = 250;
export const MAX_MAIN_THREAD_LAYOUT_NODES = 500;

/** True when a request is too big to lay out on the calling thread. */
export function exceedsMainThreadBudget(request: GraphLayoutRequest): boolean {
  return (
    request.direction === "DOWN" &&
    (request.nodes.length > MAX_MAIN_THREAD_LAYOUT_NODES ||
      request.edges.length > MAX_MAIN_THREAD_LAYOUT_EDGES)
  );
}

function elkErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "";
}

/**
 * elkjs's layered algorithm recurses per layer. On a deep or cyclic graph that
 * still fits the count budget, that DFS overflows the (especially worker)
 * stack: Chrome/Safari `RangeError: Maximum call stack size exceeded`,
 * Firefox `InternalError: too much recursion`.
 *
 * Same user-visible outcome as the count/deadline gates — not an app crash.
 */
export function isElkCallStackOverflow(error: unknown): boolean {
  const message = elkErrorMessage(error);
  return (
    /maximum call stack size exceeded/i.test(message) ||
    /too much recursion/i.test(message)
  );
}

function tooLargeLayout(request: GraphLayoutRequest): GraphLayout {
  return {
    nodes: [],
    edges: [],
    width: 0,
    height: 0,
    tooLarge: true,
    nodeCount: request.nodes.length,
    edgeCount: request.edges.length,
  };
}

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

/** Map a layout request into an ELK graph. Edges are pre-deduped by the caller. */
function buildElkGraph(request: GraphLayoutRequest): ElkNode {
  const { nodes, edges: dedupedEdges, direction } = request;
  const counterReserve = new Map(request.counterReserve);
  const children = nodes.map((node) => {
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
      ...(direction === "RIGHT" && nodes.length <= MAX_WRAP_NODES
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
 * Lazy-load ELK (~1MB) and reuse the instance. Only the main-thread fallback
 * path uses this — the worker imports elkjs directly (see
 * `workers/elk-layout.worker.ts`).
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
): [string, number][] {
  const reserve: [string, number][] = [];
  for (const [id, observations] of Object.entries(nodeToObservationsMap)) {
    if (observations.length > 1) {
      reserve.push([
        id,
        ` (${observations.length}/${observations.length})`.length,
      ]);
    }
  }
  return reserve;
}

/**
 * Decided without running ELK: either the finished layout (empty graph, or one
 * refused by the budget) or the request to hand to ELK — on the worker thread if
 * one is available. All of this is O(nodes + edges) and safe on the main thread.
 */
export type PreparedGraphLayout =
  | { kind: "layout"; layout: GraphLayout }
  | { kind: "request"; request: GraphLayoutRequest };

export function prepareGraphLayout(
  graph: GraphCanvasData,
  nodeToObservationsMap: Record<string, string[]> = {},
  direction: GraphLayoutDirection = "DOWN",
): PreparedGraphLayout {
  if (graph.nodes.length === 0) {
    return {
      kind: "layout",
      layout: { nodes: [], edges: [], width: 0, height: 0 },
    };
  }

  const dedupedEdges = dedupeEdges(graph.edges);

  // Budget gate (aggregated DOWN layout only — see MAX_GRAPH_LAYOUT_* and the
  // RIGHT-path exemption). Past the budget the layout is refused up front rather
  // than started: ELK is uninterruptible even in a worker, and at these
  // densities it would run for minutes and blow through memory.
  if (
    direction === "DOWN" &&
    (graph.nodes.length > MAX_GRAPH_LAYOUT_NODES ||
      dedupedEdges.length > MAX_GRAPH_LAYOUT_EDGES)
  ) {
    return {
      kind: "layout",
      layout: {
        nodes: [],
        edges: [],
        width: 0,
        height: 0,
        tooLarge: true,
        nodeCount: graph.nodes.length,
        edgeCount: dedupedEdges.length,
      },
    };
  }

  return {
    kind: "request",
    request: {
      nodes: graph.nodes,
      edges: dedupedEdges,
      counterReserve: buildCounterReserve(nodeToObservationsMap),
      direction,
    },
  };
}

/**
 * Run ELK on a prepared request. Pure: no DOM, no bundler-specific imports — it
 * runs identically in the layout worker and on the main thread.
 */
export async function runGraphLayout(
  elk: ELK,
  request: GraphLayoutRequest,
): Promise<GraphLayout> {
  // Defensive guard: elkjs can still throw on a graph inside the budget.
  // Stack overflow is an expected ELK limitation — same "too large" state as
  // the count/deadline gates, so the renderer does not treat it as a crash.
  // Any other throw is rethrown as a real Error so the caller surfaces a
  // recoverable layoutError.
  let result: ElkNode;
  try {
    result = await elk.layout(buildElkGraph(request));
  } catch (error) {
    if (isElkCallStackOverflow(error)) {
      return tooLargeLayout(request);
    }
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

/**
 * Lay a prepared request out on the CALLING thread — the fallback for browsers
 * without Web Workers, and for a worker that failed to load.
 */
export async function layoutGraphOnThisThread(
  request: GraphLayoutRequest,
): Promise<GraphLayout> {
  return runGraphLayout(await getElk(), request);
}

/**
 * Whole layout pipeline on the calling thread. The renderer goes through the
 * worker client instead; this is what the layout tests exercise.
 */
export async function computeGraphLayout(
  graph: GraphCanvasData,
  nodeToObservationsMap: Record<string, string[]> = {},
  direction: GraphLayoutDirection = "DOWN",
): Promise<GraphLayout> {
  const prepared = prepareGraphLayout(graph, nodeToObservationsMap, direction);
  if (prepared.kind === "layout") return prepared.layout;
  return layoutGraphOnThisThread(prepared.request);
}
