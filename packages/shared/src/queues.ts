import { z } from "zod";

export enum EventName {
  TraceUpsert = "TraceUpsert",
  BatchExport = "BatchExport",
  EvaluationExecution = "EvaluationExecution",
}

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
}

export enum QueueJobs {
  TraceUpsert = "trace-upsert",
  EvaluationExecution = "evaluation-execution-job",
  BatchExportJob = "batch-export-job",
  EnqueueBatchExportJobs = "enqueue-batch-export-jobs",
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
};
