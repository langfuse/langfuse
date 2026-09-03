import z from "zod";
import {
  ObservationAddToDatasetConfigSchema,
  BatchActionQuerySchema,
  BatchEvalEvaluatorMappingSchema,
  BatchEvalSourceTableSchema,
} from "@langfuse/shared";

/** Matches the evaluator options page size used by the run-evaluation dialog. */
export const BATCH_EVAL_EVALUATOR_LIMIT = 100;

export const CreateObservationAddToDatasetActionSchema = z.object({
  projectId: z.string(),
  query: BatchActionQuerySchema,
  config: ObservationAddToDatasetConfigSchema,
});

export const CreateObservationBatchEvaluationActionSchema = z
  .object({
    projectId: z.string(),
    query: BatchActionQuerySchema,
    evaluatorIds: z.array(z.string()).min(1).max(BATCH_EVAL_EVALUATOR_LIMIT),
    sourceTable: BatchEvalSourceTableSchema.default("events"),
    evalVersion: z.literal("v2").optional(),
    evaluatorMappings: z
      .array(BatchEvalEvaluatorMappingSchema)
      .max(BATCH_EVAL_EVALUATOR_LIMIT)
      .optional(),
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
