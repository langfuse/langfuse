import { z } from "zod";

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
