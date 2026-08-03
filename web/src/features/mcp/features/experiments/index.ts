import { env } from "@/src/env.mjs";
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
  isEnabled: async () =>
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true",
} as const satisfies McpFeatureModule;
