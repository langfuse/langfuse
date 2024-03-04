import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";
import { Worker, Job } from "bullmq";

async function routes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // console.log("routes", fastify.redis.status);
  // const worker = new Worker(
  //   "trace-evaluation-queue",
  //   async (job: Job) => {
  //     console.log("job", job.data);
  //     // Optionally report some progress
  //     // await job.updateProgress(42);
  //     // // Optionally sending an object as progress
  //     // await job.updateProgress({ foo: "bar" });
  //     console.log("something came", job);
  //     console.log(job.data);
  //     // Do something with job
  //     return "some value";
  //   },
  //   {
  //     connection: {
  //       host: "127.0.0.1",
  //       port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  //       password: process.env.REDIS_AUTH,
  //     },
  //   },
  // );
  // console.log("worker", worker.isRunning());
  // worker.on("completed", (job: Job) => {
  //   console.log(`Job with ID ${job.id} has been completed`);
  // });
  // worker.on("failed", (job: Job, err: Error) => {
  //   console.log(`Job with ID ${job.id} has failed with ${err.message}`);
  // });
}

export default fp(routes);
