import { z } from "zod";
import { eventTypes, ingestionBatchEvent } from ".";

export enum EventName {
  TraceUpsert = "TraceUpsert",
  BatchExport = "BatchExport",
  EvaluationExecution = "EvaluationExecution",
  LegacyIngestion = "LegacyIngestion",
  CloudUsageMetering = "CloudUsageMetering",
  ExperimentCreate = "ExperimentCreate",
}

export const LegacyIngestionEventFull = z.object({
  useS3EventStore: z.literal(false),
  data: ingestionBatchEvent,
  authCheck: z.object({
    validKey: z.literal(true),
    scope: z.object({
      projectId: z.string(),
      accessLevel: z.enum(["all", "scores"]),
    }),
  }),
});

export const LegacyIngestionEventMeta = z.object({
  useS3EventStore: z.literal(true),
  data: z.array(
    z.object({
      type: z.nativeEnum(eventTypes),
      eventBodyId: z.string(),
      eventId: z.string(),
    }),
  ),
  authCheck: z.object({
    validKey: z.literal(true),
    scope: z.object({
      projectId: z.string(),
      accessLevel: z.enum(["all", "scores"]),
    }),
  }),
});

export const LegacyIngestionEvent = z.discriminatedUnion("useS3EventStore", [
  LegacyIngestionEventFull,
  LegacyIngestionEventMeta,
]);

export const IngestionEvent = z.object({
  data: z.object({
    type: z.nativeEnum(eventTypes),
    eventBodyId: z.string(),
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

export const ExperimentCreateEventSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  runId: z.string(),
  description: z.string().optional(),
});

export type BatchExportJobType = z.infer<typeof BatchExportJobSchema>;
export type TraceQueueEventType = z.infer<typeof TraceQueueEventSchema>;
export type TracesQueueEventType = z.infer<typeof TracesQueueEventSchema>;
export type DatasetRunItemUpsertEventType = z.infer<
  typeof DatasetRunItemUpsertEventSchema
>;
export type EvalExecutionEventType = z.infer<typeof EvalExecutionEvent>;
export type LegacyIngestionEventType = z.infer<typeof LegacyIngestionEvent>;
export type IngestionEventQueueType = z.infer<typeof IngestionEvent>;
export type ExperimentCreateEventType = z.infer<
  typeof ExperimentCreateEventSchema
>;

export const EventBodySchema = z.union([
  z.object({
    name: z.literal(EventName.TraceUpsert),
    payload: z.array(TraceQueueEventSchema),
  }),
  z.object({
    name: z.literal(EventName.EvaluationExecution),
    payload: EvalExecutionEvent,
  }),
  z.object({
    name: z.literal(EventName.BatchExport),
    payload: BatchExportJobSchema,
  }),
  z.object({
    name: z.literal(EventName.ExperimentCreate),
    payload: ExperimentCreateEventSchema,
  }),
]);
export type EventBodyType = z.infer<typeof EventBodySchema>;

export enum QueueName {
  TraceUpsert = "trace-upsert", // Ingestion pipeline adds events on each Trace upsert
  TraceDelete = "trace-delete",
  EvaluationExecution = "evaluation-execution-queue", // Worker executes Evals
  DatasetRunItemUpsert = "dataset-run-item-upsert-queue",
  BatchExport = "batch-export-queue",
  IngestionQueue = "ingestion-queue", // Process single events with S3-merge
  LegacyIngestionQueue = "legacy-ingestion-queue", // Used for batch processing of Ingestion
  CloudUsageMeteringQueue = "cloud-usage-metering-queue",
  ExperimentCreate = "experiment-create-queue",
}

export enum QueueJobs {
  TraceUpsert = "trace-upsert",
  TraceDelete = "trace-delete",
  DatasetRunItemUpsert = "dataset-run-item-upsert",
  EvaluationExecution = "evaluation-execution-job",
  BatchExportJob = "batch-export-job",
  EnqueueBatchExportJobs = "enqueue-batch-export-jobs",
  LegacyIngestionJob = "legacy-ingestion-job",
  CloudUsageMeteringJob = "cloud-usage-metering-job",
  IngestionJob = "ingestion-job",
  ExperimentCreateJob = "experiment-create-job",
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
  [QueueName.LegacyIngestionQueue]: {
    timestamp: Date;
    id: string;
    payload: LegacyIngestionEventType;
    name: QueueJobs.LegacyIngestionJob;
  };
  [QueueName.IngestionQueue]: {
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
};
