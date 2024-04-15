import { z } from "zod";

export const TraceUpsertEvent = z.object({
  projectId: z.string(),
  traceId: z.string(),
});

export const EvalExecutionEvent = z.object({
  projectId: z.string(),
  jobExecutionId: z.string(),
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
    timestamp: Date;
    id: string;
    payload: z.infer<typeof TraceUpsertEvent>;
    name: QueueJobs.TraceUpsert;
  };
  [QueueName.EvaluationExecution]: {
    timestamp: Date;
    id: string;
    payload: z.infer<typeof EvalExecutionEvent>;
    name: QueueJobs.EvaluationExecution;
  };
};
