import { z } from "zod";

export const QueueEnvelope = z.object({
  timestamp: z.string().datetime({ offset: true }),
  id: z.string(),
});

export const TraceUpsertEvent = QueueEnvelope.extend({
  data: z.object({
    projectId: z.string(),
    traceId: z.string(),
  }),
});

export const EvalExecutionEvent = QueueEnvelope.extend({
  data: z.object({
    projectId: z.string(),
    jobExecutionId: z.string(),
  }),
});

export enum QueueName {
  TraceUpsert = "trace-upsert", // Ingestion pipeline adds events on each Trace upsert
  EvaluationExecution = "evaluation-execution-queue", // Worker executes Evals
}

export enum QueueJobs {
  TraceUpsert = "trace-upsert",
  EvaluationExecution = "evaluation-execution-job",
}

export type TQueueJobTypes = {
  [QueueName.TraceUpsert]: {
    payload: z.infer<typeof TraceUpsertEvent>;
    name: QueueJobs.TraceUpsert;
  };
  [QueueName.EvaluationExecution]: {
    payload: z.infer<typeof EvalExecutionEvent>;
    name: QueueJobs.EvaluationExecution;
  };
};
