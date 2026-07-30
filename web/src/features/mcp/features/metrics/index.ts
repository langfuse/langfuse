import { env } from "@/src/env.mjs";
import type { McpFeatureModule } from "../../server/registry";
import {
  getMetricsSchemaTool,
  handleGetMetricsSchema,
} from "./tools/getMetricsSchema";
import { queryMetricsTool, handleQueryMetrics } from "./tools/queryMetrics";

export const metricsFeature = {
  name: "metrics",
  description:
    "Analyze project usage, quality, cost, and performance metrics from Langfuse data",
  tools: [
    {
      definition: queryMetricsTool,
      handler: handleQueryMetrics,
    },
    {
      definition: getMetricsSchemaTool,
      handler: handleGetMetricsSchema,
    },
  ],
  isEnabled: async () =>
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true" &&
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "legacy",
} as const satisfies McpFeatureModule;
