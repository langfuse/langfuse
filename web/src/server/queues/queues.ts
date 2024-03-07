import { z } from "zod";

export const QueueEnvelope = z.object({
  timestamp: z.string().datetime({ offset: true }),
  id: z.string(),
});

export const EvalEvent = QueueEnvelope.extend({
  projectId: z.string(),
  traceId: z.string(),
});

export enum QueueName {
  Evaluation = "evaluation",
}

export enum QueueJobs {
  Evaluation = "evaluation-job",
}

export type TQueueJobTypes = {
  [QueueName.Evaluation]: {
    payload: z.infer<typeof EvalEvent>;
    name: QueueJobs.Evaluation;
  };
};
