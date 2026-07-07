import {
  EncodedExperimentsCursorString,
  EXPERIMENT_FILTER_COLUMNS,
  EXPERIMENT_ITEM_FILTER_COLUMNS,
  GetExperimentItemsV1ParsedQueryBase,
  GetExperimentItemsV1ParsedQuery,
  GetExperimentsV1ParsedQuery,
} from "@/src/features/public-api/types/experiments";
import { z } from "zod";
import { McpAdvancedFilterBaseSchema } from "../../core/filter-schema";

export const ListExperimentsBaseSchema = GetExperimentsV1ParsedQuery.extend({
  cursor: EncodedExperimentsCursorString.optional(),
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
    cursor: EncodedExperimentsCursorString.optional(),
    filter: z
      .array(McpAdvancedFilterBaseSchema)
      .optional()
      .describe(
        `Advanced experiment item filters as objects with column, operator, value, and type. Supported columns: ${EXPERIMENT_ITEM_FILTER_COLUMNS.join(", ")}.`,
      ),
  });

export const ListExperimentItemsInputSchema = GetExperimentItemsV1ParsedQuery;
