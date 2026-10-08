import type { McpFeatureModule } from "../registry";
import {
  deleteLlmConnectionTool,
  handleDeleteLlmConnection,
  handleListLlmConnections,
  handleUpsertLlmConnection,
  listLlmConnectionsTool,
  upsertLlmConnectionTool,
} from "./tools";

export const llmConnectionsFeature = {
  name: "llmConnections",
  description: "Manage project LLM connections",
  tools: [
    {
      definition: listLlmConnectionsTool,
      handler: handleListLlmConnections,
    },
    {
      definition: upsertLlmConnectionTool,
      handler: handleUpsertLlmConnection,
    },
    {
      definition: deleteLlmConnectionTool,
      handler: handleDeleteLlmConnection,
    },
  ],
} as const satisfies McpFeatureModule;
