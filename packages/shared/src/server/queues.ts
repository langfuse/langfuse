import { z } from "zod";
import { ingestionBatchEvent } from ".";

export enum EventName {
  TraceUpsert = "TraceUpsert",
  BatchExport = "BatchExport",
  EvaluationExecution = "EvaluationExecution",
  LegacyIngestion = "LegacyIngestion",
  CloudUsageMetering = "CloudUsageMetering",
}

export const LegacyIngestionEvent = z.object({
  data: ingestionBatchEvent,
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
export const TraceUpsertEventSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
});
export const EvalExecutionEvent = z.object({
  projectId: z.string(),
  jobExecutionId: z.string(),
});

export type BatchExportJobType = z.infer<typeof BatchExportJobSchema>;
export type TraceUpsertEventType = z.infer<typeof TraceUpsertEventSchema>;
export type EvalExecutionEventType = z.infer<typeof EvalExecutionEvent>;
export type LegacyIngestionEventType = z.infer<typeof LegacyIngestionEvent>;

export const EventBodySchema = z.union([
  z.object({
    name: z.literal(EventName.TraceUpsert),
    payload: z.array(TraceUpsertEventSchema),
  }),
  z.object({
    name: z.literal(EventName.EvaluationExecution),
    payload: EvalExecutionEvent,
  }),
  z.object({
    name: z.literal(EventName.BatchExport),
    payload: BatchExportJobSchema,
  }),
]);
export type EventBodyType = z.infer<typeof EventBodySchema>;

export enum QueueName {
  TraceUpsert = "trace-upsert", // Ingestion pipeline adds events on each Trace upsert
  EvaluationExecution = "evaluation-execution-queue", // Worker executes Evals
  BatchExport = "batch-export-queue",
  RepeatQueue = "repeat-queue",
  IngestionFlushQueue = "ingestion-flush-queue",
  LegacyIngestionQueue = "legacy-ingestion-queue",
  CloudUsageMeteringQueue = "cloud-usage-metering-queue",
}

export enum QueueJobs {
  TraceUpsert = "trace-upsert",
  EvaluationExecution = "evaluation-execution-job",
  BatchExportJob = "batch-export-job",
  EnqueueBatchExportJobs = "enqueue-batch-export-jobs",
  FlushIngestionEntity = "flush-ingestion-entity",
  LegacyIngestionJob = "legacy-ingestion-job",
  CloudUsageMeteringJob = "cloud-usage-metering-job",
}

export type TQueueJobTypes = {
  [QueueName.TraceUpsert]: {
    timestamp: Date;
    id: string;
    payload: TraceUpsertEventType;
    name: QueueJobs.TraceUpsert;
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
};
