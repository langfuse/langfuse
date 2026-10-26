import {
  EncodedExperimentsCursorString,
  EXPERIMENT_FILTER_COLUMNS,
  EXPERIMENT_ITEM_FILTER_COLUMNS,
  GetExperimentItemsV1ParsedQueryBase,
  GetExperimentItemsV1ParsedQuery,
  GetExperimentsV1ParsedQuery,
} from "@/src/features/public-api/server";
import { z } from "zod";
import { McpAdvancedFilterBaseSchema } from "../../core/filter-schema";

export const ListExperimentsBaseSchema = GetExperimentsV1ParsedQuery.extend({
  fromStartTime: GetExperimentsV1ParsedQuery.shape.fromStartTime.describe(
    "Required lower time bound for the events scanned before grouping experiments, as an ISO 8601 timestamp with timezone (Z or an explicit offset). This does not filter directly on the returned experiment startTime; aggregates may be partial.",
  ),
  toStartTime: GetExperimentsV1ParsedQuery.shape.toStartTime.describe(
    "Optional upper time bound for the events scanned before grouping experiments, as an ISO 8601 timestamp with timezone. Omit to leave the upper bound open. Aggregates only include events within the requested time window.",
  ),
  // MCP callers pass the encoded cursor string; runtime validation decodes it.
  cursor: EncodedExperimentsCursorString.optional(),
  // MCP JSON Schema generation cannot represent the public filter union/intersection.
  filter: z
    .array(McpAdvancedFilterBaseSchema)
    .optional()
    .describe(
      `Advanced experiment filters as objects with column, operator, value, and type. Supported columns: ${EXPERIMENT_FILTER_COLUMNS.join(", ")}.`,
    ),
});

export const ListExperimentsInputSchema = GetExperimentsV1ParsedQuery;

export const ListExperimentItemsBaseSchema =
  GetExperimentItemsV1ParsedQueryBase.extend({
    fromStartTime:
      GetExperimentItemsV1ParsedQueryBase.shape.fromStartTime.describe(
        "Required lower bound on experiment item startTime, as an ISO 8601 timestamp with timezone (Z or an explicit offset).",
      ),
    toStartTime: GetExperimentItemsV1ParsedQueryBase.shape.toStartTime.describe(
      "Optional upper bound on experiment item startTime, as an ISO 8601 timestamp with timezone. Omit to leave the upper bound open.",
    ),
    // MCP callers pass the encoded cursor string; runtime validation decodes it.
    cursor: EncodedExperimentsCursorString.optional(),
    // MCP JSON Schema generation cannot represent the public filter union/intersection.
    filter: z
      .array(McpAdvancedFilterBaseSchema)
      .optional()
      .describe(
        `Advanced experiment item filters as objects with column, operator, value, and type. Supported columns: ${EXPERIMENT_ITEM_FILTER_COLUMNS.join(", ")}.`,
      ),
  });

export const ListExperimentItemsInputSchema = GetExperimentItemsV1ParsedQuery;
