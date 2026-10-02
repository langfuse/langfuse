import { beforeEach, describe, expect, it, vi } from "vitest";

import { InAppAgentRunErrorCode, InAppAgentRunStatus } from "../index";
import { QueueJobs } from "../../server";

const mocks = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue(undefined),
  updateMany: vi.fn().mockResolvedValue({ count: 1 }),
}));

vi.mock("../../server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server")>()),
  InAppAgentRunQueue: {
    getInstance: () => ({ add: mocks.add }),
  },
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { enqueueInAppAgentRun } from "./enqueueRun";

describe("enqueueInAppAgentRun", () => {
  beforeEach(() => {
    mocks.add.mockClear();
    mocks.updateMany.mockClear();
  });

  it("publishes an in-app-agent-run job keyed by run id", async () => {
    await enqueueInAppAgentRun({
      prisma: { inAppAgentRun: { updateMany: mocks.updateMany } } as never,
      projectId: "project-1",
      runId: "arun_1",
    });

    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(
      QueueJobs.InAppAgentRunJob,
      expect.objectContaining({
        name: QueueJobs.InAppAgentRunJob,
        payload: { projectId: "project-1", runId: "arun_1" },
      }),
      { jobId: "arun_1" },
    );
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("marks the run failed when the queue is unavailable", async () => {
    mocks.add.mockRejectedValueOnce(new Error("queue unavailable"));

    await expect(
      enqueueInAppAgentRun({
        prisma: { inAppAgentRun: { updateMany: mocks.updateMany } } as never,
        projectId: "project-1",
        runId: "arun_1",
      }),
    ).rejects.toMatchObject({ message: "Couldn't start the run. Try again." });

    expect(mocks.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        id: "arun_1",
        projectId: "project-1",
        status: InAppAgentRunStatus.QUEUED,
      },
      data: {
        status: InAppAgentRunStatus.FAILED,
        finishedAt: expect.any(Date),
        errorCode: InAppAgentRunErrorCode.ENQUEUE_FAILED,
        errorMessage: "Couldn't start the run",
      },
    });
  });
});
