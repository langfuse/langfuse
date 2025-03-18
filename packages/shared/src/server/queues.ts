/* eslint-disable no-unused-vars */
import { z } from "zod";
import { eventTypes } from ".";
import {
  BatchActionQuerySchema,
  BatchActionType,
} from "../features/batchAction/types";
import { BatchExportTableName } from "../features/batchExport/types";

export const IngestionEvent = z.object({
  data: z.object({
    type: z.nativeEnum(eventTypes),
    eventBodyId: z.string(),
    fileKey: z.string().optional(),
  }),
  authCheck: z.object({
    validKey: z.literal(true),
    scope: z.object({
      projectId: z.string(),
      accessLevel: z.enum(["all", "scores"]),
    }),
  }),
});

export const BatchExportJobSchema = z.object({
  projectId: z.string(),
  batchExportId: z.string(),
});
export const TraceQueueEventSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
});
export const TracesQueueEventSchema = z.object({
  projectId: z.string(),
  traceIds: z.array(z.string()),
});
export const ScoresQueueEventSchema = z.object({
  projectId: z.string(),
  scoreIds: z.array(z.string()),
});
export const ProjectQueueEventSchema = z.object({
  projectId: z.string(),
  orgId: z.string(),
});
export const DatasetRunItemUpsertEventSchema = z.object({
  projectId: z.string(),
  datasetItemId: z.string(),
  traceId: z.string(),
  observationId: z.string().optional(),
});
export const EvalExecutionEvent = z.object({
  projectId: z.string(),
  jobExecutionId: z.string(),
  delay: z.number().nullish(),
});
export const PostHogIntegrationProcessingEventSchema = z.object({
  projectId: z.string(),
});
export const ExperimentCreateEventSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  runId: z.string(),
  description: z.string().optional(),
});
export const DataRetentionProcessingEventSchema = z.object({
  projectId: z.string(),
  retention: z.number(),
});
export const BatchActionProcessingEventSchema = z.discriminatedUnion(
  "actionId",
  [
    z.object({
      actionId: z.literal("score-delete"),
      projectId: z.string(),
      query: BatchActionQuerySchema,
      tableName: z.nativeEnum(BatchExportTableName),
      cutoffCreatedAt: z.date(),
      targetId: z.string().optional(),
      type: z.nativeEnum(BatchActionType),
    }),
    z.object({
      actionId: z.literal("trace-delete"),
      projectId: z.string(),
      query: BatchActionQuerySchema,
      tableName: z.nativeEnum(BatchExportTableName),
      cutoffCreatedAt: z.date(),
      targetId: z.string().optional(),
      type: z.nativeEnum(BatchActionType),
    }),
    z.object({
      actionId: z.literal("trace-add-to-annotation-queue"),
      projectId: z.string(),
      query: BatchActionQuerySchema,
      tableName: z.nativeEnum(BatchExportTableName),
      cutoffCreatedAt: z.date(),
      targetId: z.string().optional(),
      type: z.nativeEnum(BatchActionType),
    }),
    z.object({
      actionId: z.literal("eval-create"),
      targetObject: z.enum(["trace", "dataset"]),
      configId: z.string(),
      projectId: z.string(),
      cutoffCreatedAt: z.date(),
      query: BatchActionQuerySchema,
    }),
  ],
);

export const CreateEvalQueueEventSchema = DatasetRunItemUpsertEventSchema.and(
  z.object({
    configId: z.string(),
    timestamp: z.date(),
  }),
).or(
  TraceQueueEventSchema.and(
    z.object({
      timestamp: z.date(),
      configId: z.string(),
    }),
  ),
);

export type CreateEvalQueueEventType = z.infer<
  typeof CreateEvalQueueEventSchema
>;
export type BatchExportJobType = z.infer<typeof BatchExportJobSchema>;
export type TraceQueueEventType = z.infer<typeof TraceQueueEventSchema>;
export type TracesQueueEventType = z.infer<typeof TracesQueueEventSchema>;
export type ScoresQueueEventType = z.infer<typeof ScoresQueueEventSchema>;
export type ProjectQueueEventType = z.infer<typeof ProjectQueueEventSchema>;
export type DatasetRunItemUpsertEventType = z.infer<
  typeof DatasetRunItemUpsertEventSchema
>;
export type EvalExecutionEventType = z.infer<typeof EvalExecutionEvent>;
export type IngestionEventQueueType = z.infer<typeof IngestionEvent>;
export type ExperimentCreateEventType = z.infer<
  typeof ExperimentCreateEventSchema
>;
export type PostHogIntegrationProcessingEventType = z.infer<
  typeof PostHogIntegrationProcessingEventSchema
>;
export type DataRetentionProcessingEventType = z.infer<
  typeof DataRetentionProcessingEventSchema
>;
export type BatchActionProcessingEventType = z.infer<
  typeof BatchActionProcessingEventSchema
>;

export enum QueueName {
  TraceUpsert = "trace-upsert", // Ingestion pipeline adds events on each Trace upsert
  TraceDelete = "trace-delete",
  ProjectDelete = "project-delete",
  EvaluationExecution = "evaluation-execution-queue", // Worker executes Evals
  DatasetRunItemUpsert = "dataset-run-item-upsert-queue",
  BatchExport = "batch-export-queue",
  IngestionQueue = "ingestion-queue", // Process single events with S3-merge
  IngestionSecondaryQueue = "secondary-ingestion-queue", // Separates high priority + high throughput projects from other projects.
  CloudUsageMeteringQueue = "cloud-usage-metering-queue",
  ExperimentCreate = "experiment-create-queue",
  PostHogIntegrationQueue = "posthog-integration-queue",
  PostHogIntegrationProcessingQueue = "posthog-integration-processing-queue",
  CoreDataS3ExportQueue = "core-data-s3-export-queue",
  MeteringDataPostgresExportQueue = "metering-data-postgres-export-queue",
  DataRetentionQueue = "data-retention-queue",
  DataRetentionProcessingQueue = "data-retention-processing-queue",
  BatchActionQueue = "batch-action-queue",
  CreateEvalQueue = "create-eval-queue",
  ScoreDelete = "score-delete",
}

export enum QueueJobs {
  TraceUpsert = "trace-upsert",
  TraceDelete = "trace-delete",
  ProjectDelete = "project-delete",
  DatasetRunItemUpsert = "dataset-run-item-upsert",
  EvaluationExecution = "evaluation-execution-job",
  BatchExportJob = "batch-export-job",
  CloudUsageMeteringJob = "cloud-usage-metering-job",
  IngestionJob = "ingestion-job",
  IngestionSecondaryJob = "secondary-ingestion-job",
  ExperimentCreateJob = "experiment-create-job",
  PostHogIntegrationJob = "posthog-integration-job",
  PostHogIntegrationProcessingJob = "posthog-integration-processing-job",
  CoreDataS3ExportJob = "core-data-s3-export-job",
  MeteringDataPostgresExportJob = "metering-data-postgres-export-job",
  DataRetentionJob = "data-retention-job",
  DataRetentionProcessingJob = "data-retention-processing-job",
  BatchActionProcessingJob = "batch-action-processing-job",
  CreateEvalJob = "create-eval-job",
  ScoreDelete = "score-delete",
}

export type TQueueJobTypes = {
  [QueueName.TraceUpsert]: {
    timestamp: Date;
    id: string;
    payload: TraceQueueEventType;
    name: QueueJobs.TraceUpsert;
  };
  [QueueName.TraceDelete]: {
    timestamp: Date;
    id: string;
    payload: TracesQueueEventType | TraceQueueEventType;
    name: QueueJobs.TraceDelete;
  };
  [QueueName.ScoreDelete]: {
    timestamp: Date;
    id: string;
    payload: ScoresQueueEventType;
    name: QueueJobs.ScoreDelete;
  };
  [QueueName.ProjectDelete]: {
    timestamp: Date;
    id: string;
    payload: ProjectQueueEventType;
    name: QueueJobs.ProjectDelete;
  };
  [QueueName.DatasetRunItemUpsert]: {
    timestamp: Date;
    id: string;
    payload: DatasetRunItemUpsertEventType;
    name: QueueJobs.DatasetRunItemUpsert;
  };
  [QueueName.EvaluationExecution]: {
    timestamp: Date;
    id: string;
    payload: EvalExecutionEventType;
    name: QueueJobs.EvaluationExecution;
  };
  [QueueName.BatchExport]: {
    timestamp: Date;
    id: string;
    payload: BatchExportJobType;
    name: QueueJobs.BatchExportJob;
  };
  [QueueName.IngestionQueue]: {
    timestamp: Date;
    id: string;
    payload: IngestionEventQueueType;
    name: QueueJobs.IngestionJob;
  };
  [QueueName.IngestionSecondaryQueue]: {
    timestamp: Date;
    id: string;
    payload: IngestionEventQueueType;
    name: QueueJobs.IngestionJob;
  };
  [QueueName.ExperimentCreate]: {
    timestamp: Date;
    id: string;
    payload: ExperimentCreateEventType;
    name: QueueJobs.ExperimentCreateJob;
  };
  [QueueName.PostHogIntegrationProcessingQueue]: {
    timestamp: Date;
    id: string;
    payload: PostHogIntegrationProcessingEventType;
    name: QueueJobs.PostHogIntegrationProcessingJob;
  };
  [QueueName.DataRetentionProcessingQueue]: {
    timestamp: Date;
    id: string;
    payload: DataRetentionProcessingEventType;
    name: QueueJobs.DataRetentionProcessingJob;
  };
  [QueueName.BatchActionQueue]: {
    timestamp: Date;
    id: string;
    payload: BatchActionProcessingEventType;
    name: QueueJobs.BatchActionProcessingJob;
  };
  [QueueName.CreateEvalQueue]: {
    timestamp: Date;
    id: string;
    payload: CreateEvalQueueEventType;
    name: QueueJobs.CreateEvalJob;
  };
};
