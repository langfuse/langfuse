import type { McpFeatureModule } from "../registry";
import {
  deleteLlmConnectionTool,
  deleteOrganizationLlmConnectionTool,
  handleDeleteLlmConnection,
  handleDeleteOrganizationLlmConnection,
  handleListLlmConnections,
  handleListOrganizationLlmConnections,
  handleUpsertLlmConnection,
  handleUpsertOrganizationLlmConnection,
  listLlmConnectionsTool,
  listOrganizationLlmConnectionsTool,
  upsertLlmConnectionTool,
  upsertOrganizationLlmConnectionTool,
} from "./tools";

export const llmConnectionsFeature = {
  name: "llmConnections",
  description: "Manage project and organization LLM connections",
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
    {
      definition: listOrganizationLlmConnectionsTool,
      handler: handleListOrganizationLlmConnections,
    },
    {
      definition: upsertOrganizationLlmConnectionTool,
      handler: handleUpsertOrganizationLlmConnection,
    },
    {
      definition: deleteOrganizationLlmConnectionTool,
      handler: handleDeleteOrganizationLlmConnection,
    },
  ],
} as const satisfies McpFeatureModule;
