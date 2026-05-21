import type { McpFeatureModule } from "../../server/registry";
import { healthTools } from "./tools";

export const healthFeature: McpFeatureModule = {
  name: "health",
  description: "Check public API health",
  tools: healthTools,
};
