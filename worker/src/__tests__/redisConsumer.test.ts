import { expect, test, describe, vi, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  QueueJobs,
  QueueName,
  TraceUpsertQueue,
} from "@langfuse/shared/src/server";
import { WorkerManager } from "../queues/workerManager";

describe.sequential("handle redis events", () => {
  afterEach(async () => {
    await WorkerManager.closeWorkers();
  });

  test("handle redis job succeeding", async () => {
    WorkerManager.register(QueueName.TraceUpsert, async () => true);

    const traceUpsertQueue = TraceUpsertQueue.getInstance();

    expect(traceUpsertQueue).toBeDefined();

    const job = await traceUpsertQueue?.add(QueueJobs.TraceUpsert, {
      id: randomUUID(),
      timestamp: new Date(),
      payload: {
        projectId: "project-id",
        traceId: "trace-id",
      },
      name: QueueJobs.TraceUpsert as const,
    });

    await vi.waitFor(
      async () => {
        const jobState = await traceUpsertQueue?.getJobState(job!.id!);
        expect(jobState).toEqual("completed");
      },
      {
        timeout: 20_000,
      },
    );
  }, 20_000);

  test("handle no matching queue worker", async () => {
    // IngestionQueue worker vs TraceUpsert producer
    WorkerManager.register(QueueName.IngestionQueue, async () => true);

    const traceUpsertQueue = TraceUpsertQueue.getInstance();

    expect(traceUpsertQueue).toBeDefined();

    const job = await traceUpsertQueue?.add(
      QueueJobs.TraceUpsert,
      {
        id: randomUUID(),
        timestamp: new Date(),
        payload: {
          projectId: "project-id",
          traceId: "trace-id",
        },
        name: QueueJobs.TraceUpsert as const,
      },
      { delay: 0 },
    );

    // Wait for 2s
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Job should still be waiting as there is no listener
    const jobState = await traceUpsertQueue?.getJobState(job!.id!);
    expect(jobState).toEqual("delayed");
  }, 5000);

  // test("handle redis job failing", async () => {
  //   vi.mock("../eval-service", () => ({
  //     createEvalJobs: async ({
  //       data,
  //     }: {
  //       data: z.infer<typeof TraceUpsertEvent>;
  //     }) => {
  //       logger.error("Failed to create eval jobs");
  //       throw new Error("Failed to create eval jobs");
  //     },
  //   }));

  //   // this activates the consumer
  //   evalJobCreator?.on("completed", (job, err) => {
  //     logger.info(`Eval Job with id ${job?.id} completed`);
  //   });

  //   expect(evalQueue).toBeDefined();

  //   const job = await evalQueue?.add(
  //     QueueJobs.TraceUpsert,
  //     {
  //       id: randomUUID(),
  //       timestamp: new Date(),
  //       payload: {
  //         projectId: "project-id",
  //         traceId: "trace-id",
  //       },
  //       name: QueueJobs.TraceUpsert as const,
  //     },
  //     {
  //       attempts: 2,
  //     }
  //   );

  //   await vi.waitFor(
  //     async () => {
  //       const jobState = await evalQueue?.getJobState(job!.id!);
  //       logger.info(`Job state: ${jobState}`);
  //       expect(jobState).toEqual("failed");
  //       const j = await evalQueue?.getJob(job!.id!);
  //       expect(j?.attemptsMade).toEqual(2);
  //     },
  //     {
  //       timeout: 15_000,
  //     }
  //   );
  // }, 15_000);
});
