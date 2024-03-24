import { z } from "zod";

export const QueueEnvelope = z.object({
  timestamp: z.string().datetime({ offset: true }),
  id: z.string(),
});

export const EvalEvent = QueueEnvelope.extend({
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
  Evaluation = "evaluation-queue",
  Evaluation_Execution = "evaluation-execution-queue",
}

export enum QueueJobs {
  Evaluation = "evaluation-job",
  Evaluation_Execution = "evaluation-execution-job",
}

export type TQueueJobTypes = {
  [QueueName.Evaluation]: {
    payload: z.infer<typeof EvalEvent>;
    name: QueueJobs.Evaluation;
  };
  [QueueName.Evaluation_Execution]: {
    payload: z.infer<typeof EvalExecutionEvent>;
    name: QueueJobs.Evaluation_Execution;
  };
};
