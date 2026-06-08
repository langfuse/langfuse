import type { McpFeatureModule } from "../../server/registry";
import { getHealthTool, handleGetHealth } from "./tools/getHealth";

export const healthFeature: McpFeatureModule = {
  name: "health",
  description: "Check Langfuse health",
  tools: [
    {
      definition: getHealthTool,
      handler: handleGetHealth,
      allowInAppAgentKey: true,
    },
  ],
};
