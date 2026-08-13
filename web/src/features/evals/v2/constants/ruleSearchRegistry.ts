import { eventsEvalFilterColumns } from "@langfuse/shared";

import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";
import { EXPERIMENTS_AND_EVALS_FILTER_ALIAS } from "@/src/features/search-bar/lib/filter-aliases";

/**
 * Derived from the same columns the rule service validates. The overlay only
 * contains grammar-specific aliases and copy that ColumnDefinition does not.
 */
export const RULE_FIELD_REGISTRY = fieldRegistryFromColumns(
  eventsEvalFilterColumns,
  {
    id: "evaluationRules",
    allowFreeText: false,
    metadata: true,
    filterAliases: [EXPERIMENTS_AND_EVALS_FILTER_ALIAS],
    aiContextFields: [
      { observedOptionsKey: "type", promptLabel: "type" },
      { observedOptionsKey: "level", promptLabel: "level" },
      { observedOptionsKey: "environment", promptLabel: "environment" },
      { observedOptionsKey: "traceName", promptLabel: "traceName" },
      { observedOptionsKey: "name", promptLabel: "name" },
      { observedOptionsKey: "traceTags", promptLabel: "tags" },
      {
        observedOptionsKey: "calledToolNames",
        promptLabel: "calledToolNames",
      },
      {
        observedOptionsKey: "experimentDatasetId",
        promptLabel: "experimentDatasetId (dataset)",
      },
    ],
    fields: {
      environment: { aliases: ["env"] },
      traceName: { aliases: ["tracename", "trace_name"] },
      userId: { aliases: ["userid", "user_id", "user"] },
      sessionId: { aliases: ["sessionid", "session_id", "session"] },
      tags: { aliases: ["tag", "tracetags", "trace_tags"] },
      experimentDatasetId: {
        aliases: [
          "dataset",
          "datasetid",
          "dataset_id",
          "experimentdatasetid",
          "experiment_dataset_id",
        ],
      },
      isRootObservation: {
        aliases: ["isrootobservation", "is_root_observation", "root"],
        negatedLabel: "Is not root observation",
      },
      experimentId: { aliases: ["experimentid", "experiment_id"] },
      isExperimentItemRootSpan: {
        aliases: [
          "isexperimentitemrootspan",
          "is_experiment_item_root_span",
          "experimentroot",
        ],
        negatedLabel: "Is not experiment item root span",
      },
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
