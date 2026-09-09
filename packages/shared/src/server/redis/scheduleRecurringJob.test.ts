import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import { logger } from "../logger";
import { scheduleRecurringJob } from "./scheduleRecurringJob";

const { env } = vi.hoisted(() => ({
  env: {
    LANGFUSE_BULLMQ_LEGACY_REPEATABLE_JOB_CLEANUP: "true",
  },
}));

vi.mock("../../env", () => ({ env }));

vi.mock("../logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const createQueueMock = () => {
  const removeRepeatable = vi.fn().mockResolvedValue(true);
  const getRepeatableJobs = vi.fn().mockResolvedValue([]);
  const upsertJobScheduler = vi.fn().mockResolvedValue({});
  const queue = {
    name: "test-queue",
    removeRepeatable,
    getRepeatableJobs,
    upsertJobScheduler,
  } as unknown as Queue;
  return {
    queue,
    removeRepeatable,
    getRepeatableJobs,
    upsertJobScheduler,
  };
};

describe("scheduleRecurringJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.LANGFUSE_BULLMQ_LEGACY_REPEATABLE_JOB_CLEANUP = "true";
  });

  it("removes legacy schedules for the current and previous patterns before upserting", async () => {
    const { queue, getRepeatableJobs, removeRepeatable, upsertJobScheduler } =
      createQueueMock();
    getRepeatableJobs.mockResolvedValue([
      {
        key: "legacy-repeat-key",
        name: "my-job",
        pattern: "5 * * * *",
      },
    ]);

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
      previousPatterns: ["25 * * * *"],
    });

    expect(removeRepeatable).toHaveBeenCalledTimes(3);
    expect(removeRepeatable).toHaveBeenCalledWith("my-job", {
      pattern: "*/15 * * * *",
    });
    expect(removeRepeatable).toHaveBeenCalledWith("my-job", {
      pattern: "25 * * * *",
    });
    expect(removeRepeatable).toHaveBeenCalledWith("my-job", {
      pattern: "5 * * * *",
    });
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "my-job",
      { pattern: "*/15 * * * *" },
      { name: "my-job", data: {} },
    );
    // The legacy cleanup must complete before the scheduler is upserted, so
    // a concurrently created legacy entry cannot outlive the migration.
    for (const removeCall of removeRepeatable.mock.invocationCallOrder) {
      expect(removeCall).toBeLessThan(
        upsertJobScheduler.mock.invocationCallOrder[0]!,
      );
    }
  });

  it("passes template data through to the scheduler", async () => {
    const { queue, upsertJobScheduler } = createQueueMock();

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "* * * * *",
      data: { type: "recurring" },
    });

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "my-job",
      { pattern: "* * * * *" },
      { name: "my-job", data: { type: "recurring" } },
    );
  });

  it("removes discovered legacy interval schedules before upserting", async () => {
    const { queue, getRepeatableJobs, removeRepeatable } = createQueueMock();
    getRepeatableJobs.mockResolvedValue([
      {
        key: "legacy-repeat-key",
        name: "my-job",
        pattern: null,
        every: "60000",
      },
    ]);

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
    });

    expect(removeRepeatable).toHaveBeenCalledWith("my-job", { every: 60000 });
  });

  it("skips legacy cleanup when it was completed before a FIPS rollout", async () => {
    env.LANGFUSE_BULLMQ_LEGACY_REPEATABLE_JOB_CLEANUP = "false";
    const { queue, removeRepeatable, upsertJobScheduler } = createQueueMock();

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
      previousPatterns: ["25 * * * *"],
    });

    expect(removeRepeatable).not.toHaveBeenCalled();
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "my-job",
      { pattern: "*/15 * * * *" },
      { name: "my-job", data: {} },
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("updates a scheduler with a previous pattern during a FIPS rollout", async () => {
    env.LANGFUSE_BULLMQ_LEGACY_REPEATABLE_JOB_CLEANUP = "false";
    const { queue, getRepeatableJobs, upsertJobScheduler } = createQueueMock();
    getRepeatableJobs.mockResolvedValue([
      {
        // BullMQ exposes job schedulers through getRepeatableJobs too. The
        // scheduler id is the job name, unlike an MD5-keyed legacy schedule.
        key: "my-job",
        name: "my-job",
        pattern: "25 * * * *",
      },
    ]);

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
      previousPatterns: ["25 * * * *"],
    });

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "my-job",
      { pattern: "*/15 * * * *" },
      { name: "my-job", data: {} },
    );
  });

  it("does not create a scheduler when an unknown legacy pattern remains in a FIPS rollout", async () => {
    env.LANGFUSE_BULLMQ_LEGACY_REPEATABLE_JOB_CLEANUP = "false";
    const { queue, removeRepeatable, getRepeatableJobs, upsertJobScheduler } =
      createQueueMock();
    getRepeatableJobs.mockResolvedValue([
      {
        key: "legacy-repeat-key",
        name: "my-job",
        pattern: "5 * * * *",
      },
    ]);

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
    });

    expect(removeRepeatable).not.toHaveBeenCalled();
    expect(upsertJobScheduler).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("legacy-repeat-key"),
    );
  });

  it("does not create a scheduler when it cannot verify legacy cleanup for a FIPS rollout", async () => {
    env.LANGFUSE_BULLMQ_LEGACY_REPEATABLE_JOB_CLEANUP = "false";
    const { queue, removeRepeatable, getRepeatableJobs, upsertJobScheduler } =
      createQueueMock();
    getRepeatableJobs.mockRejectedValue(new Error("redis down"));

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
    });

    expect(removeRepeatable).not.toHaveBeenCalled();
    expect(upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("still upserts the scheduler when legacy cleanup fails", async () => {
    const { queue, removeRepeatable, upsertJobScheduler } = createQueueMock();
    removeRepeatable.mockRejectedValue(new Error("redis down"));

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "* * * * *",
    });

    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
  });

  it("resolves instead of rejecting when the upsert fails", async () => {
    const { queue, upsertJobScheduler } = createQueueMock();
    upsertJobScheduler.mockRejectedValue(new Error("redis down"));

    await expect(
      scheduleRecurringJob(queue, {
        jobName: "my-job",
        pattern: "* * * * *",
      }),
    ).resolves.toBeUndefined();
  });
});
