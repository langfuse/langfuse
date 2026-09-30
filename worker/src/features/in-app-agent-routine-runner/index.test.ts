import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueueJobs } from "@langfuse/shared/src/server";

const mocks = vi.hoisted(() => ({
  add: vi.fn().mockResolvedValue(undefined),
  findMany: vi.fn(),
  claimDue: vi.fn(),
  fire: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  InAppAgentRunQueue: {
    getInstance: () => ({
      add: mocks.add,
      remove: vi.fn(),
    }),
  },
  redis: {},
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    inAppAgentRoutine: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@langfuse/shared/in-app-agent/server/routineFire", () => ({
  claimDueInAppAgentRoutine: mocks.claimDue,
  fireInAppAgentRoutine: mocks.fire,
}));

import { InAppAgentRoutineRunner } from "./index";

function runnerWithStubbedLock() {
  const runner = new InAppAgentRoutineRunner();
  (
    runner as unknown as {
      lock: { withLock: unknown; extend: unknown };
    }
  ).lock = {
    withLock: async (operation: () => Promise<unknown>) => operation(),
    extend: vi.fn().mockResolvedValue(true),
  };
  return runner;
}

describe("InAppAgentRoutineRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimDue.mockResolvedValue({
      nextRunAt: new Date("2026-03-28T08:00:00.000Z"),
    });
    mocks.fire.mockImplementation(
      async (params: { routine: { projectId: string } }) => {
        await mocks.add(
          QueueJobs.InAppAgentRunJob,
          {
            timestamp: new Date(),
            id: "job-from-runner",
            name: QueueJobs.InAppAgentRunJob,
            payload: {
              projectId: params.routine.projectId,
              runId: "arun_from_runner",
            },
          },
          { jobId: "arun_from_runner" },
        );
        return {
          status: "fired",
          conversationId: "aconv_from_runner",
          runId: "arun_from_runner",
        };
      },
    );
  });

  it("publishes an in-app-agent-run job after claiming a due routine", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "artn_due",
        projectId: "project-1",
        createdByUserId: "user-1",
        name: "Daily digest",
        prompt: "Summarize yesterday's traces.",
        cron: "0 9 * * *",
        timezone: "UTC",
        nextRunAt: new Date("2026-03-27T08:00:00.000Z"),
      },
    ]);

    await runnerWithStubbedLock().processBatch();

    expect(mocks.claimDue).toHaveBeenCalledExactlyOnceWith({
      prisma: expect.anything(),
      projectId: "project-1",
      routineId: "artn_due",
      dueNextRunAt: new Date("2026-03-27T08:00:00.000Z"),
      cron: "0 9 * * *",
      timezone: "UTC",
      now: expect.any(Date),
    });
    expect(mocks.add).toHaveBeenCalledOnce();
    expect(mocks.add.mock.calls[0]?.[0]).toBe(QueueJobs.InAppAgentRunJob);
    expect(mocks.add.mock.calls[0]?.[2]).toEqual({
      jobId: "arun_from_runner",
    });
  });
});
