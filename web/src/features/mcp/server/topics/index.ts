import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";

import { type McpFeatureModule } from "@/src/features/mcp/server/registry";

import {
  createTopicFacetTool,
  handleCreateTopicFacet,
  handleListTopicAssignments,
  handleListTopicFacets,
  handleListTopicRules,
  handleListTopics,
  handleListTopicSummaries,
  listTopicAssignmentsTool,
  listTopicFacetsTool,
  listTopicRulesTool,
  listTopicsTool,
  listTopicSummariesTool,
} from "./tools";

export const topicsFeature = {
  name: "topics",
  description:
    "Read Topics rules, facets, topic maps and per-trace summaries and assignments, and create custom facets, in the current Langfuse project",
  tools: [
    { definition: listTopicRulesTool, handler: handleListTopicRules },
    { definition: listTopicFacetsTool, handler: handleListTopicFacets },
    { definition: createTopicFacetTool, handler: handleCreateTopicFacet },
    { definition: listTopicsTool, handler: handleListTopics },
    { definition: listTopicSummariesTool, handler: handleListTopicSummaries },
    {
      definition: listTopicAssignmentsTool,
      handler: handleListTopicAssignments,
    },
  ],
  isEnabled: (context) => isTopicsProjectEnabled(context.projectId),
} as const satisfies McpFeatureModule;
