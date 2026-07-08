import z from "zod";
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
  DatasetDelete = "dataset-delete",
  TraceDelete = "trace-delete",
  TraceAddToAnnotationQueue = "trace-add-to-annotation-queue",
  SessionAddToAnnotationQueue = "session-add-to-annotation-queue",
  ObservationAddToAnnotationQueue = "observation-add-to-annotation-queue",
  ObservationAddToDataset = "observation-add-to-dataset",
  ObservationBatchEvaluation = "observation-run-batched-evaluation",
  ExperimentCompare = "experiment-compare",
}

const ActionIdSchema = z.enum(ActionId);

export const BatchActionQuerySchema = z.object({
  filter: z.array(singleFilter).nullable(),
  orderBy,
  searchQuery: z.string().optional(),
  searchType: z.array(TracingSearchType).optional(),
  pathPrefix: z.string().optional(),
  // Dispatch-time snapshot of the user's v4 beta flag; routes the sessions
  // read stream to the events table instead of the legacy traces path.
  useEventsTable: z.boolean().optional(),
});

export type BatchActionQuery = z.infer<typeof BatchActionQuerySchema>;

const TraceDeleteUtcTimestampSchema = z.iso.datetime();

export const TraceDeleteCursorSchema = z.object({
  timestamp: TraceDeleteUtcTimestampSchema,
  traceId: z.string(),
  id: z.string().optional(),
});

const TraceDeleteInFlightBatchSchema = z.object({
  traceIds: z.array(z.string()),
  cursorAfter: TraceDeleteCursorSchema,
  minTimestamp: TraceDeleteUtcTimestampSchema,
  maxTimestamp: TraceDeleteUtcTimestampSchema,
});

export const TraceDeleteBatchActionConfigSchema = z.object({
  version: z.literal(1),
  source: z.enum(["traces", "events"]),
  cutoffCreatedAt: TraceDeleteUtcTimestampSchema,
  failureCount: z.number().int().nonnegative().default(0),
  inFlightBatch: TraceDeleteInFlightBatchSchema.nullable(),
});

export type TraceDeleteBatchActionConfig = z.infer<
  typeof TraceDeleteBatchActionConfigSchema
>;

export type TraceDeleteBatchActionCursor = z.infer<
  typeof TraceDeleteCursorSchema
>;

export const createTraceDeleteBatchActionConfig = (opts: {
  useEventsTable: boolean;
  cutoffCreatedAt: Date;
}): TraceDeleteBatchActionConfig => ({
  version: 1,
  source: opts.useEventsTable ? "events" : "traces",
  cutoffCreatedAt: opts.cutoffCreatedAt.toISOString(),
  failureCount: 0,
  inFlightBatch: null,
});

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
