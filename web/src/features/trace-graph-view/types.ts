import { z } from "zod";

export type GraphNodeData = {
  id: string;
  label: string;
  type: string;
  /**
   * Static suffix rendered after the label (e.g. " (2)" for the 2nd occurrence
   * of a repeated name in expanded mode). The renderer's dynamic cycling
   * counter (" (2/3)", aggregated mode) takes precedence when present.
   */
  counter?: string;
};

/**
 * How the graph is built from the trace's observations:
 * - "aggregated": repeated step names collapse into one node (loops render as
 *   cycles) — the original view, good for overall shape.
 * - "expanded-steps": one node per observation, edges follow the inferred
 *   step sequence — the run unrolled "as it ran".
 * - "expanded-flow": one node per observation, edges from real structure —
 *   parent→first-child plus happened-before ordering between siblings
 *   (fork/join from actual timing).
 */
export const GRAPH_VIEW_MODES = [
  "aggregated",
  "expanded-steps",
  "expanded-flow",
] as const;
export type GraphViewMode = (typeof GRAPH_VIEW_MODES)[number];

export type GraphCanvasData = {
  nodes: GraphNodeData[];
  edges: { from: string; to: string }[];
};

export const LANGGRAPH_NODE_TAG = "langgraph_node";
export const LANGGRAPH_STEP_TAG = "langgraph_step";
export const LANGGRAPH_START_NODE_NAME = "__start__";
export const LANGGRAPH_END_NODE_NAME = "__end__";
export const LANGFUSE_START_NODE_NAME = "__start__";
export const LANGFUSE_END_NODE_NAME = "__end__";

export const LanggraphMetadataSchema = z.object({
  [LANGGRAPH_NODE_TAG]: z.string(),
  [LANGGRAPH_STEP_TAG]: z.number(),
});

export const AgentGraphDataSchema = z.object({
  id: z.string(),
  parent_observation_id: z.string().nullish(),
  type: z.string(),
  name: z.string(),
  start_time: z.string(),
  end_time: z.string().nullish(),
  node: z.string().nullish(),
  step: z.coerce.number().nullish(),
});

export type AgentGraphDataResponse = {
  id: string;
  node: string | null; // langgraph_node
  step: number | null;
  parentObservationId: string | null;
  name: string; // span name
  startTime: string;
  endTime?: string;
  observationType: string;
};
