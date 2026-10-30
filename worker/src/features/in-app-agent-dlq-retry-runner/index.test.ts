import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getQueue: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  getQueue: mocks.getQueue,
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { InAppAgentDlqRetryRunner } from "./index";

const HEARTBEAT_STALE_MS = 60_000;

function runnerWithStubbedLock() {
  const runner = new InAppAgentDlqRetryRunner();
  (runner as unknown as { lock: { withLock: unknown } }).lock = {
    withLock: async (operation: () => Promise<unknown>) => operation(),
  };
  return runner;
}

function failedJob(params: {
  id: string;
  finishedOn: number | undefined;
  retry: () => Promise<void>;
}) {
  return {
    id: params.id,
    finishedOn: params.finishedOn,
    retry: params.retry,
  };
}

describe("InAppAgentDlqRetryRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries a failed job older than the heartbeat-stale window", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    mocks.getQueue.mockReturnValue({
      getFailed: vi.fn().mockResolvedValue([
        failedJob({
          id: "old-job",
          finishedOn: Date.now() - HEARTBEAT_STALE_MS - 1,
          retry,
        }),
      ]),
    });

    await runnerWithStubbedLock().processBatch();

    expect(retry).toHaveBeenCalledOnce();
  });

  it("skips a job that failed within the heartbeat-stale window", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    mocks.getQueue.mockReturnValue({
      getFailed: vi.fn().mockResolvedValue([
        failedJob({
          id: "fresh-job",
          finishedOn: Date.now() - 5_000,
          retry,
        }),
      ]),
    });

    await runnerWithStubbedLock().processBatch();

    expect(retry).not.toHaveBeenCalled();
  });

  it("continues after a retry throw so later jobs still run", async () => {
    const failingRetry = vi.fn().mockRejectedValue(new Error("retry failed"));
    const succeedingRetry = vi.fn().mockResolvedValue(undefined);
    const oldFinishedOn = Date.now() - HEARTBEAT_STALE_MS - 1;
    mocks.getQueue.mockReturnValue({
      getFailed: vi.fn().mockResolvedValue([
        failedJob({
          id: "failing-job",
          finishedOn: oldFinishedOn,
          retry: failingRetry,
        }),
        failedJob({
          id: "ok-job",
          finishedOn: oldFinishedOn,
          retry: succeedingRetry,
        }),
      ]),
    });

    await runnerWithStubbedLock().processBatch();

    expect(failingRetry).toHaveBeenCalledOnce();
    expect(succeedingRetry).toHaveBeenCalledOnce();
  });

  it("is a no-op when the queue instance is missing", async () => {
    mocks.getQueue.mockReturnValue(null);

    await expect(
      runnerWithStubbedLock().processBatch(),
    ).resolves.toBeUndefined();
  });
});
