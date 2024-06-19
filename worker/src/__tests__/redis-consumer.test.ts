import { expect, test, describe, vi } from "vitest";
import { evalQueue } from "../api";
import { QueueJobs, TraceUpsertEventSchema } from "@langfuse/shared";
import { randomUUID } from "crypto";
import { z } from "zod";
import logger from "../logger";
import { evalJobCreator } from "../queues/evalQueue";

describe.sequential("handle redis events", () => {
  test("handle redis job succeeding", async () => {
    vi.mock("../eval-service", () => ({
      createEvalJobs: async ({
        data,
      }: {
        data: z.infer<typeof TraceUpsertEventSchema>;
      }) => {
        return true;
      },
    }));

    // this activates the consumer
    evalJobCreator?.on("completed", (job, err) => {
      logger.info(`Eval Job with id ${job?.id} completed`);
    });

    expect(evalQueue).toBeDefined();

    const job = await evalQueue?.add(QueueJobs.TraceUpsert, {
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
        const jobState = await evalQueue?.getJobState(job!.id!);
        expect(jobState).toEqual("completed");
      },
      {
        timeout: 20_000,
      }
    );
  }, 20_000);

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
