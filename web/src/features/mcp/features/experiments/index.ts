import type { McpFeatureModule } from "../../server/registry";
import {
  handleListExperimentItems,
  handleListExperiments,
  listExperimentItemsTool,
  listExperimentsTool,
} from "./tools";

export const experimentsFeature = {
  name: "experiments",
  description: "Review experiments and experiment items",
  tools: [
    {
      definition: listExperimentsTool,
      handler: handleListExperiments,
    },
    {
      definition: listExperimentItemsTool,
      handler: handleListExperimentItems,
    },
  ],
} as const satisfies McpFeatureModule;
