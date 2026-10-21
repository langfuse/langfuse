import type { McpFeatureModule } from "../registry";
import {
  handleListLlmConnections,
  listLlmConnectionsTool,
} from "./tools/listLlmConnections";

export const llmConnectionsFeature = {
  name: "llmConnections",
  description: "Inspect the project's LLM connections",
  tools: [
    { definition: listLlmConnectionsTool, handler: handleListLlmConnections },
  ],
} as const satisfies McpFeatureModule;
