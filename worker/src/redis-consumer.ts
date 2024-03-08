import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";
import { Worker, Job } from "bullmq";
import { z } from "zod";
import { evaluate } from "./eval-service";

export const QueueEnvelope = z.object({
  timestamp: z.string().datetime({ offset: true }),
  id: z.string(),
});

export const EvalBody = QueueEnvelope.extend({
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
    payload: z.infer<typeof EvalBody>;
    name: typeof QueueJobs.Evaluation;
  };
};

async function routes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const worker = new Worker<TQueueJobTypes[QueueName.Evaluation]>(
    "trace-evaluation-queue",
    async (job: Job<TQueueJobTypes[QueueName.Evaluation]>) => {
      console.log("job", job.data);
      // Optionally report some progress
      // await job.updateProgress(42);
      // // Optionally sending an object as progress
      // await job.updateProgress({ foo: "bar" });
      await evaluate({ data: job.data.payload });

      console.log(job.data);
      // Do something with job
      return "some value";
    },
    {
      connection: {
        host: "127.0.0.1",
        port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
        password: process.env.REDIS_AUTH,
      },
    },
  );

  worker.on("completed", (job: Job) => {
    console.log(`Job with ID ${job.id} has been completed`);
  });
  worker.on("failed", (job: Job, err: Error) => {
    console.log(`Job with ID ${job.id} has failed with ${err.message}`);
  });
}

export default fp(routes);
