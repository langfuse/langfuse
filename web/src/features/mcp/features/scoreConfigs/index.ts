import type { McpFeatureModule } from "../../server/registry";
import { scoreConfigTools } from "./tools";

export const scoreConfigsFeature: McpFeatureModule = {
  name: "scoreConfigs",
  description: "Manage score configuration public API resources",
  tools: scoreConfigTools,
};
