export enum QueueName {
  Evaluation = "trace-evaluation-queue",
}

export enum QueueJobs {
  Evaluation = "trace-evaluation-job",
}

export type QueueJobTypes = {
  [QueueName.Evaluation]: {
    payload: {
      projectId: string;
      traceId: string;
    };
    name: QueueJobs.Evaluation;
  };
};
