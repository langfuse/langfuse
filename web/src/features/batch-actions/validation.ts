import z from "zod/v4";
import {
  AddToDatasetMappingSchema,
  ObservationAddToDatasetConfigSchema,
  BatchActionQuerySchema,
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
});

export const ValidateBatchAddToDatasetMappingSchema = z.object({
  projectId: z.string(),
  observationId: z.string(),
  traceId: z.string(),
  datasetId: z.string(),
  mapping: AddToDatasetMappingSchema,
});

export const GetBatchActionByIdSchema = z.object({
  projectId: z.string(),
  batchActionId: z.string(),
});

export const ListBatchActionsSchema = z.object({
  projectId: z.string(),
  page: z.number(),
  limit: z.number(),
});
