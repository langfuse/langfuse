import { z } from "zod/v4";

export type GraphCanvasData = {
  nodes: string[];
  edges: { from: string; to: string }[];
};

export const LANGGRAPH_NODE_TAG = "langgraph_node";
export const LANGGRAPH_STEP_TAG = "langgraph_step";
export const LANGGRAPH_START_NODE_NAME = "__start__";
export const LANGGRAPH_END_NODE_NAME = "__end__";

export const LanggraphMetadataSchema = z.object({
  [LANGGRAPH_NODE_TAG]: z.string(),
  [LANGGRAPH_STEP_TAG]: z.number(),
});

export const AgentGraphDataSchema = z.object({
  id: z.string(),
  parent_observation_id: z.string(),
  node: z.string().min(1).nullish(),
  step: z.coerce.number().nullish(),
});

export type AgentGraphDataResponse = {
  id: string;
  node: string;
  step: number;
  parentObservationId: string;
};
