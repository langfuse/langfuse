import { expect, test, describe, vi } from "vitest";
import { evalQueue } from "../api";
import { QueueJobs, TraceUpsertEvent } from "@langfuse/shared";
import { randomUUID } from "crypto";
import { z } from "zod";
import logger from "../logger";
import { evalJobCreator } from "../redis/consumer";

describe("handle redis events", () => {
  test("handle redis job succeeding", async () => {
    vi.mock("../eval-service", () => ({
      createEvalJobs: async ({
        data,
      }: {
        data: z.infer<typeof TraceUpsertEvent>;
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
        timeout: 10_000,
      }
    );
  }, 10_000);
});
