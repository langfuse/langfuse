import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { Job } from "bullmq";
import { UnrecoverableError } from "../../errors/UnrecoverableError";

const QueueName = {
  CodeEvalExecution: "code-eval-execution-queue",
} as const;

const JobExecutionStatus = {
  ERROR: "ERROR",
} as const;

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    jobExecution: {
      update: vi.fn(),
    },
  },
}));

vi.mock("../../features/evaluation/observationEval", () => ({
  processObservationEval: vi.fn(),
}));

vi.mock("../../features/evaluation/codeBased", () => ({
  executeCodeBasedEvaluation: vi.fn(),
}));

const { FakeCodeEvalDispatcherError } = vi.hoisted(() => {
  class FakeCodeEvalDispatcherError extends Error {
    public readonly code: string;
    public readonly retryable: boolean;

    constructor(
      message: string,
      options: { code: string; retryable?: boolean },
    ) {
      super(message);
      this.name = "CodeEvalDispatcherError";
      this.code = options.code;
      this.retryable = options.retryable ?? false;
    }
  }

  return { FakeCodeEvalDispatcherError };
});

vi.mock("@langfuse/shared/src/server", () => ({
  CodeEvalDispatcherError: FakeCodeEvalDispatcherError,
  getCurrentSpan: vi.fn().mockReturnValue({
    setAttribute: vi.fn(),
  }),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
  QueueName: {
    CodeEvalExecution: "code-eval-execution-queue",
  },
  traceException: vi.fn(),
}));

vi.mock("../../features/utils", () => ({
  createW3CTraceId: vi.fn().mockReturnValue("test-trace-id"),
}));

vi.mock("../../errors/UnrecoverableError", async () => {
  const actual = await vi.importActual("../../errors/UnrecoverableError");
  return {
    ...actual,
    isUnrecoverableError: vi.fn(),
  };
});

import { prisma } from "@langfuse/shared/src/db";
import { processObservationEval } from "../../features/evaluation/observationEval";
import { traceException } from "@langfuse/shared/src/server";
import { executeCodeBasedEvaluation } from "../../features/evaluation/codeBased";
import { isUnrecoverableError } from "../../errors/UnrecoverableError";

describe("codeEvalExecutionQueueProcessor", () => {
  const projectId = "test-project-123";
  const jobExecutionId = "job-exec-456";
  const observationS3Path = "evals/test/observation.json";
  const queueName = `${QueueName.CodeEvalExecution}-1`;
  let codeEvalExecutionQueueProcessor: (job: Job<any>) => Promise<unknown>;

  const createMockJob = (
    overrides: {
      data?: Record<string, unknown>;
      attemptsMade?: number;
      opts?: { attempts?: number };
    } = {},
  ): Job<any> =>
    ({
      data: {
        id: "queue-job-123",
        name: "CodeEvalExecution",
        timestamp: new Date(),
        payload: {
          projectId,
          jobExecutionId,
          observationS3Path,
        },
        retryBaggage: { attempt: 0 },
        ...overrides.data,
      },
      attemptsMade: overrides.attemptsMade ?? 0,
      opts: overrides.opts ?? { attempts: 10 },
    }) as Job<any>;

  beforeAll(async () => {
    const { codeEvalExecutionQueueProcessorBuilder } =
      await import("../codeEvalQueue");
    codeEvalExecutionQueueProcessor =
      codeEvalExecutionQueueProcessorBuilder(queueName);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (isUnrecoverableError as unknown as Mock).mockReturnValue(false);
  });

  it("should process code observation evals through the code template gate", async () => {
    (processObservationEval as Mock).mockResolvedValue(undefined);

    const result = await codeEvalExecutionQueueProcessor(createMockJob());

    expect(result).toBe(true);
    expect(processObservationEval).toHaveBeenCalledWith({
      event: {
        projectId,
        jobExecutionId,
        observationS3Path,
      },
      validateTemplate: expect.any(Function),
      executor: executeCodeBasedEvaluation,
    });
  });

  it("should treat non-retryable dispatcher errors as terminal and show the dispatcher message", async () => {
    const error = new FakeCodeEvalDispatcherError(
      "Evaluator returned invalid result",
      { code: "INVALID_RESULT", retryable: false },
    );
    (processObservationEval as Mock).mockRejectedValue(error);

    const result = await codeEvalExecutionQueueProcessor(createMockJob());

    expect(result).toBeUndefined();
    expect(prisma.jobExecution.update).toHaveBeenCalledWith({
      where: { id: jobExecutionId, projectId },
      data: {
        status: JobExecutionStatus.ERROR,
        endTime: expect.any(Date),
        error: "Evaluator returned invalid result",
        executionTraceId: "test-trace-id",
      },
    });
    expect(traceException).not.toHaveBeenCalled();
  });

  it("should mask internal lambda error codes when finalizing on the last attempt", async () => {
    const error = new FakeCodeEvalDispatcherError(
      "Function not found: code-based-eval-executor-node",
      { code: "LAMBDA_CONFIGURATION_ERROR", retryable: false },
    );
    (processObservationEval as Mock).mockRejectedValue(error);

    const result = await codeEvalExecutionQueueProcessor(createMockJob());

    expect(result).toBeUndefined();
    expect(prisma.jobExecution.update).toHaveBeenCalledWith({
      where: { id: jobExecutionId, projectId },
      data: {
        status: JobExecutionStatus.ERROR,
        endTime: expect.any(Date),
        error: "An internal error occurred",
        executionTraceId: "test-trace-id",
      },
    });
  });

  it("should mark unrecoverable skeleton errors as terminal", async () => {
    const error = new UnrecoverableError(
      "Code-based eval execution is not implemented yet",
    );
    (processObservationEval as Mock).mockRejectedValue(error);
    (isUnrecoverableError as unknown as Mock).mockReturnValue(true);

    const result = await codeEvalExecutionQueueProcessor(createMockJob());

    expect(result).toBeUndefined();
    expect(prisma.jobExecution.update).toHaveBeenCalledWith({
      where: {
        id: jobExecutionId,
        projectId,
      },
      data: {
        status: JobExecutionStatus.ERROR,
        endTime: expect.any(Date),
        error: "Code-based eval execution is not implemented yet",
        executionTraceId: "test-trace-id",
      },
    });
    expect(traceException).not.toHaveBeenCalled();
  });

  it("should rethrow retryable errors without writing ERROR while retries remain", async () => {
    const error = new Error("temporary dispatcher failure");
    (processObservationEval as Mock).mockRejectedValue(error);

    await expect(
      codeEvalExecutionQueueProcessor(createMockJob()),
    ).rejects.toThrow(error);

    expect(prisma.jobExecution.update).not.toHaveBeenCalled();
    expect(traceException).toHaveBeenCalledWith(error);
  });

  it("should mark the job as ERROR on the final retry attempt", async () => {
    const error = new Error("temporary dispatcher failure");
    (processObservationEval as Mock).mockRejectedValue(error);

    await expect(
      codeEvalExecutionQueueProcessor(
        createMockJob({ attemptsMade: 9, opts: { attempts: 10 } }),
      ),
    ).rejects.toThrow(error);

    expect(prisma.jobExecution.update).toHaveBeenCalledWith({
      where: {
        id: jobExecutionId,
        projectId,
      },
      data: {
        status: JobExecutionStatus.ERROR,
        endTime: expect.any(Date),
        error: "temporary dispatcher failure",
        executionTraceId: "test-trace-id",
      },
    });
    expect(traceException).toHaveBeenCalledWith(error);
  });
});
