import type { McpFeatureModule } from "../../server/registry";
import { datasetTools } from "./tools";

export const datasetsFeature: McpFeatureModule = {
  name: "datasets",
  description: "Manage datasets, dataset items, run items, and runs",
  tools: datasetTools,
};
