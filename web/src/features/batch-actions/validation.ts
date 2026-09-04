import z from "zod";
import { endOfDay, startOfDay, subMonths } from "date-fns";
import {
  ObservationAddToDatasetConfigSchema,
  BatchActionQuerySchema,
  BatchEvalEvaluatorMappingSchema,
  BatchEvalSourceTableSchema,
} from "@langfuse/shared";

/** Matches the evaluator options page size used by the run-evaluation dialog. */
export const BATCH_EVAL_EVALUATOR_LIMIT = 100;
export const EVALUATOR_BACKFILL_ITEM_LIMIT = 25_000;

export const CreateObservationAddToDatasetActionSchema = z.object({
  projectId: z.string(),
  query: BatchActionQuerySchema,
  config: ObservationAddToDatasetConfigSchema,
});

const observationBatchEvaluationFields = {
  projectId: z.string(),
  query: BatchActionQuerySchema,
  evaluatorIds: z.array(z.string()).min(1).max(BATCH_EVAL_EVALUATOR_LIMIT),
  sourceTable: BatchEvalSourceTableSchema.default("events"),
  evalVersion: z.literal("v2").optional(),
  evaluatorMappings: z
    .array(BatchEvalEvaluatorMappingSchema)
    .max(BATCH_EVAL_EVALUATOR_LIMIT)
    .optional(),
};

const backfillTimeRangeSchema = z
  .object({
    from: z.date(),
    to: z.date(),
  })
  .refine(({ from, to }) => from <= to, {
    message: "The backfill start must be before its end.",
    path: ["from"],
  })
  .refine(({ from }) => from >= startOfDay(subMonths(new Date(), 6)), {
    message: "The backfill cannot start more than six months ago.",
    path: ["from"],
  })
  .refine(({ to }) => to <= endOfDay(new Date()), {
    message: "The backfill cannot end in the future.",
    path: ["to"],
  });

function validateEvaluatorMappings(
  value: {
    evaluatorIds: string[];
    evalVersion?: "v2";
    evaluatorMappings?: z.infer<typeof BatchEvalEvaluatorMappingSchema>[];
  },
  ctx: z.RefinementCtx,
) {
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
}

export const CreateObservationBatchEvaluationActionSchema = z
  .object(observationBatchEvaluationFields)
  .superRefine(validateEvaluatorMappings);

export const CreateObservationEvaluatorBackfillActionSchema = z
  .object({
    ...observationBatchEvaluationFields,
    sampling: z.number().min(0).max(1),
    rowLimit: z.number().int().positive().max(EVALUATOR_BACKFILL_ITEM_LIMIT),
    backfillTimeRange: backfillTimeRangeSchema,
  })
  .superRefine(validateEvaluatorMappings);

export const GetBatchActionByIdSchema = z.object({
  projectId: z.string(),
  batchActionId: z.string(),
});
