import type { McpFeatureModule } from "@/src/features/mcp/server/tools";

import {
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
    "Read Topics rules, facets, topic maps and per-trace summaries and assignments in the current Langfuse project",
  tools: [
    { definition: listTopicRulesTool, handler: handleListTopicRules },
    { definition: listTopicFacetsTool, handler: handleListTopicFacets },
    { definition: listTopicsTool, handler: handleListTopics },
    { definition: listTopicSummariesTool, handler: handleListTopicSummaries },
    {
      definition: listTopicAssignmentsTool,
      handler: handleListTopicAssignments,
    },
  ],
} as const satisfies McpFeatureModule;
