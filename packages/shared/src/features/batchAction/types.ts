import z from "zod/v4";
import { singleFilter } from "../../interfaces/filters";
import { orderBy } from "../../interfaces/orderBy";
import { BatchTableNames } from "../../interfaces/tableNames";
import { TracingSearchType } from "../../interfaces/search";

export enum BatchActionType {
  Create = "create",
  Delete = "delete",
}

export enum BatchActionStatus {
  Queued = "QUEUED",
  Processing = "PROCESSING",
  Completed = "COMPLETED",
  Failed = "FAILED",
  Partial = "PARTIAL",
}

export enum ActionId {
  ScoreDelete = "score-delete",
  TraceDelete = "trace-delete",
  TraceAddToAnnotationQueue = "trace-add-to-annotation-queue",
  SessionAddToAnnotationQueue = "session-add-to-annotation-queue",
  ObservationAddToAnnotationQueue = "observation-add-to-annotation-queue",
  ObservationAddToDataset = "observation-add-to-dataset",
  ObservationBatchEvaluation = "observation-run-evaluation",
}

const ActionIdSchema = z.nativeEnum(ActionId);

export const BatchActionQuerySchema = z.object({
  filter: z.array(singleFilter).nullable(),
  orderBy,
  searchQuery: z.string().optional(),
  searchType: z.array(TracingSearchType).optional(),
});

export type BatchActionQuery = z.infer<typeof BatchActionQuerySchema>;

export const CreateBatchActionSchema = z.object({
  projectId: z.string(),
  actionId: ActionIdSchema,
  targetId: z.string().optional(),
  query: BatchActionQuerySchema,
  tableName: z.enum(BatchTableNames),
});

export const GetIsBatchActionInProgressSchema = z.object({
  projectId: z.string(),
  actionId: ActionIdSchema,
  tableName: z.enum(BatchTableNames),
});
