import z from "zod";
import {
  ObservationAddToDatasetConfigSchema,
  BatchActionQuerySchema,
  BatchEvalSourceTableSchema,
} from "@langfuse/shared";

export const CreateObservationAddToDatasetActionSchema = z.object({
  projectId: z.string(),
  query: BatchActionQuerySchema,
  config: ObservationAddToDatasetConfigSchema,
});

export const CreateObservationBatchEvaluationActionSchema = z.object({
  projectId: z.string(),
  query: BatchActionQuerySchema,
  evaluatorIds: z.array(z.string()).min(1),
  sourceTable: BatchEvalSourceTableSchema.default("events"),
  evalVersion: z.literal("v2").optional(),
});

export const GetBatchActionByIdSchema = z.object({
  projectId: z.string(),
  batchActionId: z.string(),
});
