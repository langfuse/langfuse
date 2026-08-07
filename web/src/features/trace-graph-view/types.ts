import { z } from "zod";

export type GraphNodeData = {
  id: string;
  label: string;
  type: string;
};

/**
 * How the graph is built from the trace's observations:
 * - "aggregated": repeated step names collapse into one node (loops render as
 *   cycles) — the original view, good for overall shape.
 * - "expanded": one node per observation — the run "as it ran". Edges come
 *   from the instrumented hierarchy (parent → first child) plus
 *   happened-before ordering between siblings (fork/join from actual
 *   timing), so loops unroll into an acyclic DAG.
 */
export const GRAPH_VIEW_MODES = ["aggregated", "expanded"] as const;
export type GraphViewMode = (typeof GRAPH_VIEW_MODES)[number];

export type GraphCanvasData = {
  nodes: GraphNodeData[];
  edges: { from: string; to: string }[];
};

export const LANGGRAPH_NODE_TAG = "langgraph_node";
export const LANGGRAPH_STEP_TAG = "langgraph_step";
export const LANGGRAPH_CHECKPOINT_NS_TAG = "langgraph_checkpoint_ns";
export const LANGGRAPH_START_NODE_NAME = "__start__";
export const LANGGRAPH_END_NODE_NAME = "__end__";
export const LANGFUSE_START_NODE_NAME = "__start__";
export const LANGFUSE_END_NODE_NAME = "__end__";

export const LanggraphMetadataSchema = z.object({
  [LANGGRAPH_NODE_TAG]: z.string(),
  [LANGGRAPH_STEP_TAG]: z.number(),
  [LANGGRAPH_CHECKPOINT_NS_TAG]: z.string().optional(),
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
  // Nested LangGraph subgraphs encode ancestry here (node:uuid|child:uuid).
  checkpoint_ns: z.string().nullish(),
});

export type AgentGraphDataResponse = {
  id: string;
  node: string | null; // langgraph_node (may be path-qualified for subgraphs)
  step: number | null;
  parentObservationId: string | null;
  name: string; // span name
  startTime: string;
  endTime?: string;
  observationType: string;
  /** Raw `langgraph_checkpoint_ns` — used to qualify nested subgraph nodes. */
  checkpointNs?: string | null;
};
