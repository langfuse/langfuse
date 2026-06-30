import type { ELK, ElkNode } from "elkjs";

import { type GraphCanvasData } from "../types";
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
}

/**
 * ELK "layered" options for a top-down, deterministic DAG. Orthogonal routing +
 * merged edges keep dense traces from turning into a hairball.
 * @see https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html
 */
const LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "org.eclipse.elk.layered",
  "elk.direction": "DOWN",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.mergeEdges": "true",
  "elk.layered.spacing.nodeNodeBetweenLayers": "52",
  "elk.spacing.nodeNode": "32",
  "elk.spacing.edgeNode": "20",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
};

/** Map our {nodes, edges} into an ELK graph, deduping edges and dropping self-loops. */
function buildElkGraph(
  graph: GraphCanvasData,
  counterReserve: Map<string, number>,
): ElkNode {
  const children = graph.nodes.map((node) => {
    const { width, height } = measureNode(
      node,
      counterReserve.get(node.id) ?? 0,
    );
    return { id: node.id, width, height };
  });

  const seen = new Set<string>();
  const edges = graph.edges
    .filter((edge) => {
      if (edge.from === edge.to) return false; // self-loop
      // JSON key, not a space-joined one: node ids are SDK-supplied names that
      // commonly contain spaces, so two distinct edges must not collide.
      const key = JSON.stringify([edge.from, edge.to]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((edge, index) => ({
      id: `edge-${index}`,
      sources: [edge.from],
      targets: [edge.to],
    }));

  return {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
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
): Promise<GraphLayout> {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const elk = await getElk();
  const counterReserve = buildCounterReserve(nodeToObservationsMap);
  const result = await elk.layout(buildElkGraph(graph, counterReserve));

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
