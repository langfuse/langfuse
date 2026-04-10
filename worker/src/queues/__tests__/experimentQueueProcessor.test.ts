import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { Job } from "bullmq";

vi.mock("@langfuse/shared/src/server", () => ({
  ExperimentCreateQueue: {
    getInstance: vi.fn().mockReturnValue({
      add: vi.fn(),
    }),
  },
  QueueJobs: {
    ExperimentCreateJob: "experiment-create-job",
  },
  QueueName: {
    ExperimentCreate: "experiment-create-queue",
  },
  isLLMCompletionError: vi.fn(),
  logger: {
    error: vi.fn(),
  },
  traceException: vi.fn(),
}));

vi.mock("../../features/utils", () => ({
  retryLLMRateLimitError: vi.fn(),
}));

vi.mock("../../features/experiments/experimentServiceClickhouse", () => ({
  createExperimentJobClickhouse: vi.fn(),
}));

vi.mock("../../errors/UnrecoverableError", async () => {
  const actual = await vi.importActual("../../errors/UnrecoverableError");
  return {
    ...actual,
    isUnrecoverableError: vi.fn(),
  };
});

import { isLLMCompletionError } from "@langfuse/shared/src/server";
import { createExperimentJobClickhouse } from "../../features/experiments/experimentServiceClickhouse";
import { retryLLMRateLimitError } from "../../features/utils";
import { experimentCreateQueueProcessor } from "../experimentQueue";
import { isUnrecoverableError } from "../../errors/UnrecoverableError";

describe("experimentCreateQueueProcessor", () => {
  const createMockJob = (): Job<any> =>
    ({
      data: {
        payload: {
          projectId: "project-id",
          runId: "run-id",
        },
      },
    }) as Job<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    (isLLMCompletionError as Mock).mockReturnValue(false);
    (isUnrecoverableError as Mock).mockReturnValue(false);
  });

  it("rethrows retryable LLM errors when the retry queue is unavailable", async () => {
    const llmError = new Error("Rate limit exceeded");
    (llmError as Error & { isRetryable: boolean }).isRetryable = true;
    (createExperimentJobClickhouse as Mock).mockRejectedValue(llmError);
    (isLLMCompletionError as Mock).mockReturnValue(true);
    (retryLLMRateLimitError as Mock).mockResolvedValue({
      outcome: "queue_unavailable",
    });

    await expect(
      experimentCreateQueueProcessor(createMockJob()),
    ).rejects.toThrow("Rate limit exceeded");

    expect(retryLLMRateLimitError).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            projectId: "project-id",
            runId: "run-id",
          }),
        }),
      }),
      expect.objectContaining({
        table: "dataset_runs",
        idField: "runId",
      }),
    );
  });
});
