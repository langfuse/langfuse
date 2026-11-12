import z from "zod";
import {
  ObservationAddToDatasetConfigSchema,
  BatchActionQuerySchema,
  BatchEvalEvaluatorMappingSchema,
  BatchEvalSourceTableSchema,
} from "@langfuse/shared";
import {
  isTopicFilter,
  TOPIC_FILTERS_IN_BATCH_JOBS_MESSAGE,
} from "@langfuse/shared/topics";

// These actions always run from the query, which cannot resolve topic membership yet.
const QueryWithoutTopicFiltersSchema = BatchActionQuerySchema.refine(
  (query) => !(query.filter ?? []).some(isTopicFilter),
  { message: TOPIC_FILTERS_IN_BATCH_JOBS_MESSAGE, path: ["filter"] },
);

/** Matches the evaluator options page size used by the run-evaluation dialog. */
export const BATCH_EVAL_EVALUATOR_LIMIT = 100;

export const CreateObservationAddToDatasetActionSchema = z.object({
  projectId: z.string(),
  query: QueryWithoutTopicFiltersSchema,
  config: ObservationAddToDatasetConfigSchema,
});

export const CreateObservationBatchEvaluationActionSchema = z
  .object({
    projectId: z.string(),
    query: QueryWithoutTopicFiltersSchema,
    evaluatorIds: z.array(z.string()).min(1).max(BATCH_EVAL_EVALUATOR_LIMIT),
    sourceTable: BatchEvalSourceTableSchema.default("events"),
    evalVersion: z.literal("v2").optional(),
    evaluatorMappings: z
      .array(BatchEvalEvaluatorMappingSchema)
      .max(BATCH_EVAL_EVALUATOR_LIMIT)
      .optional(),
    sampling: z.number().min(0).max(1).optional(),
    rowLimit: z.number().int().positive().max(25_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.evaluatorMappings) return;

    if (value.evalVersion !== "v2") {
      ctx.addIssue({
        code: "custom",
        message: "Variable mapping overrides require evaluator v2.",
        path: ["evaluatorMappings"],
      });
      return;
    }

    const evaluatorIds = new Set(value.evaluatorIds);
    const mappingIds = new Set<string>();
    for (const [index, mapping] of value.evaluatorMappings.entries()) {
      if (!evaluatorIds.has(mapping.evaluatorId)) {
        ctx.addIssue({
          code: "custom",
          message: "Mapping override must refer to a selected evaluator.",
          path: ["evaluatorMappings", index, "evaluatorId"],
        });
      }
      if (mappingIds.has(mapping.evaluatorId)) {
        ctx.addIssue({
          code: "custom",
          message: "An evaluator can only have one mapping override.",
          path: ["evaluatorMappings", index, "evaluatorId"],
        });
      }
      mappingIds.add(mapping.evaluatorId);
    }
  });

export const GetBatchActionByIdSchema = z.object({
  projectId: z.string(),
  batchActionId: z.string(),
});
