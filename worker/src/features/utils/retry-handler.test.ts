import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T02:00:00.000Z"));
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    (prisma.jobExecution.findFirstOrThrow as Mock).mockResolvedValue({
      createdAt: new Date("2026-01-01T01:00:00.000Z"),
    });
  });

  afterEach(() => {
    (Math.random as unknown as Mock).mockRestore?.();
    vi.useRealTimers();
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

  it("returns max_attempts without queueing when retry budget is exhausted", async () => {
    const add = vi.fn();

    const result = await retryLLMRateLimitError(
      {
        data: {
          timestamp: new Date("2026-01-01T01:00:00.000Z"),
          payload: {
            projectId: "project-id",
            jobExecutionId: "job-execution-id",
          },
          retryBaggage: {
            originalJobTimestamp: new Date("2026-01-01T01:00:00.000Z"),
            attempt: 4,
          },
        },
      },
      {
        table: "job_executions",
        idField: "jobExecutionId",
        queue: { add },
        queueName: "llm-as-a-judge-execution-queue-1",
        jobName: "llm-as-a-judge-execution-job",
      },
    );

    expect(result).toEqual({
      outcome: "skipped",
      reason: "max_attempts",
    });
    expect(add).not.toHaveBeenCalled();
  });

  it("returns too_old without queueing when retry age budget is exhausted", async () => {
    const add = vi.fn();
    (prisma.jobExecution.findFirstOrThrow as Mock).mockResolvedValue({
      createdAt: new Date("2025-12-31T23:59:59.000Z"),
    });

    const result = await retryLLMRateLimitError(
      {
        data: {
          timestamp: new Date("2025-12-31T23:59:59.000Z"),
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
      },
    );

    expect(result).toEqual({
      outcome: "skipped",
      reason: "too_old",
    });
    expect(add).not.toHaveBeenCalled();
  });

  it("caps scheduled delay at the remaining retry age budget", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    (prisma.jobExecution.findFirstOrThrow as Mock).mockResolvedValue({
      createdAt: new Date("2026-01-01T00:01:00.000Z"),
    });

    const result = await retryLLMRateLimitError(
      {
        data: {
          timestamp: new Date("2026-01-01T00:01:00.000Z"),
          payload: {
            projectId: "project-id",
            jobExecutionId: "job-execution-id",
          },
          retryBaggage: {
            originalJobTimestamp: new Date("2026-01-01T00:01:00.000Z"),
            attempt: 3,
          },
        },
      },
      {
        table: "job_executions",
        idField: "jobExecutionId",
        queue: { add },
        queueName: "llm-as-a-judge-execution-queue-1",
        jobName: "llm-as-a-judge-execution-job",
      },
    );

    expect(result).toMatchObject({
      outcome: "scheduled",
      delaySeconds: 60,
      retryBaggage: {
        attempt: 4,
        originalJobTimestamp: new Date("2026-01-01T00:01:00.000Z"),
      },
    });
    expect(add).toHaveBeenCalledWith(
      "llm-as-a-judge-execution-queue-1",
      expect.objectContaining({
        retryBaggage: expect.objectContaining({
          attempt: 4,
        }),
      }),
      { delay: 60 * 1000 },
    );
  });

  it("applies jitter to the scheduled delay", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    (Math.random as unknown as Mock).mockReturnValue(0);
    (prisma.jobExecution.findFirstOrThrow as Mock).mockResolvedValue({
      createdAt: new Date("2026-01-01T02:00:00.000Z"),
    });

    const result = await retryLLMRateLimitError(
      {
        data: {
          timestamp: new Date("2026-01-01T02:00:00.000Z"),
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
      },
    );

    expect(result).toMatchObject({
      outcome: "scheduled",
      delaySeconds: 4 * 60,
      retryBaggage: {
        attempt: 1,
        originalJobTimestamp: new Date("2026-01-01T02:00:00.000Z"),
      },
    });
    expect(add).toHaveBeenCalledWith(
      "llm-as-a-judge-execution-queue-1",
      expect.objectContaining({
        retryBaggage: expect.objectContaining({
          attempt: 1,
        }),
      }),
      { delay: 4 * 60 * 1000 },
    );
  });
});
