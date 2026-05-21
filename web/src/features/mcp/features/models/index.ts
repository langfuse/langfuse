import type { McpFeatureModule } from "../../server/registry";
import { modelTools } from "./tools";

export const modelsFeature: McpFeatureModule = {
  name: "models",
  description: "Manage public API model definitions",
  tools: modelTools,
};
