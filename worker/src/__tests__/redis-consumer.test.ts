import { expect, test, describe, vi } from "vitest";
import { evalQueue } from "../api";
import { QueueJobs, TraceUpsertEvent } from "@langfuse/shared";
import { randomUUID } from "crypto";
import { z } from "zod";

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

    expect(evalQueue).toBeDefined();

    const job = await evalQueue?.add(QueueJobs.TraceUpsert, {
      payload: {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        data: {
          projectId: "project-id",
          traceId: "trace-id",
        },
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
