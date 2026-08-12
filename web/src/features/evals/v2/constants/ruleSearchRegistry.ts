import { observationEvalFilterColumns } from "@langfuse/shared";

import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

/**
 * Derived from the same columns the rule service validates. The overlay only
 * contains grammar-specific aliases and copy that ColumnDefinition does not.
 */
export const RULE_FIELD_REGISTRY = fieldRegistryFromColumns(
  observationEvalFilterColumns,
  {
    id: "evaluationRules",
    allowFreeText: false,
    metadata: true,
    fields: {
      environment: { aliases: ["env"] },
      traceName: { aliases: ["tracename", "trace_name"] },
      userId: { aliases: ["userid", "user_id", "user"] },
      sessionId: { aliases: ["sessionid", "session_id", "session"] },
      tags: { aliases: ["tag", "tracetags", "trace_tags"] },
      isRootObservation: {
        aliases: ["isrootobservation", "is_root_observation", "root"],
        negatedLabel: "Is not root observation",
      },
      experimentId: { aliases: ["experimentid", "experiment_id"] },
      calledToolNames: {
        aliases: [
          "calledtoolnames",
          "called_tool_names",
          "calledtools",
          "called_tools",
        ],
      },
      toolCalls: { aliases: ["toolcalls", "tool_calls"] },
    },
  },
);
