import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";

import { type McpFeatureModule } from "@/src/features/mcp/server/registry";

import {
  getTopicsForTracesTool,
  handleGetTopicsForTraces,
  handleListTopicFacets,
  handleListTopics,
  listTopicFacetsTool,
  listTopicsTool,
} from "./tools";

export const topicsFeature = {
  name: "topics",
  description:
    "Read Topics facets, topic maps and per-trace Topics results in the current Langfuse project",
  tools: [
    { definition: listTopicFacetsTool, handler: handleListTopicFacets },
    { definition: listTopicsTool, handler: handleListTopics },
    { definition: getTopicsForTracesTool, handler: handleGetTopicsForTraces },
  ],
  isEnabled: (context) => isTopicsProjectEnabled(context.projectId),
} as const satisfies McpFeatureModule;
