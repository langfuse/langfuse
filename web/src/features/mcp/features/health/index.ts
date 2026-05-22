import type { McpFeatureModule } from "../../server/registry";
import { getHealthTool, handleGetHealth } from "./tools";

export const healthFeature: McpFeatureModule = {
  name: "health",
  description: "Check public API health",
  tools: [
    {
      definition: getHealthTool,
      handler: handleGetHealth,
      allowInAppAgentKey: true,
    },
  ],
};
