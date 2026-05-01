import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@langfuse/shared/src/server", () => ({
  convertQueueNameToMetricName: vi.fn().mockImplementation((name) => name),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  recordDistribution: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    datasetRuns: {
      findFirstOrThrow: vi.fn(),
    },
    jobExecution: {
      findFirstOrThrow: vi.fn(),
    },
  },
}));

vi.mock("crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("retry-job-id"),
}));

import { prisma } from "@langfuse/shared/src/db";
import { logger, recordDistribution } from "@langfuse/shared/src/server";
import { retryLLMRateLimitError } from "./retry-handler";

describe("retryLLMRateLimitError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.jobExecution.findFirstOrThrow as Mock).mockResolvedValue({
      createdAt: new Date(),
    });
  });

  it("returns queue_unavailable instead of throwing when queue.add fails", async () => {
    const add = vi.fn().mockRejectedValue(new Error("redis unavailable"));

    const result = await retryLLMRateLimitError(
      {
        data: {
          timestamp: new Date(),
          payload: {
            projectId: "project-id",
            jobExecutionId: "job-execution-id",
          },
        },
      },
      {
        table: "job_executions",
        idField: "jobExecutionId",
        queue: { add },
        queueName: "llm-as-a-judge-execution-queue-1",
        jobName: "llm-as-a-judge-execution-job",
        delayFn: () => 30_000,
      },
    );

    expect(result).toEqual({
      outcome: "queue_unavailable",
    });
    expect(add).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to enqueue retry job"),
      expect.any(Error),
    );
    expect(recordDistribution).toHaveBeenCalledTimes(2);
  });

  it("returns queue_unavailable instead of throwing when age lookup fails", async () => {
    (prisma.jobExecution.findFirstOrThrow as Mock).mockRejectedValue(
      new Error("database unavailable"),
    );

    const result = await retryLLMRateLimitError(
      {
        data: {
          timestamp: new Date(),
          payload: {
            projectId: "project-id",
            jobExecutionId: "job-execution-id",
          },
        },
      },
      {
        table: "job_executions",
        idField: "jobExecutionId",
        queue: { add: vi.fn() },
        queueName: "llm-as-a-judge-execution-queue-1",
        jobName: "llm-as-a-judge-execution-job",
        delayFn: () => 30_000,
      },
    );

    expect(result).toEqual({
      outcome: "queue_unavailable",
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to handle 429 retry"),
      expect.any(Error),
    );
    expect(recordDistribution).not.toHaveBeenCalled();
  });
});
