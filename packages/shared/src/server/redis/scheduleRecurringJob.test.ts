import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import { scheduleRecurringJob } from "./scheduleRecurringJob";

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
  const upsertJobScheduler = vi.fn().mockResolvedValue({});
  const queue = {
    name: "test-queue",
    removeRepeatable,
    upsertJobScheduler,
  } as unknown as Queue;
  return { queue, removeRepeatable, upsertJobScheduler };
};

describe("scheduleRecurringJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes legacy schedules for the current and previous patterns before upserting", async () => {
    const { queue, removeRepeatable, upsertJobScheduler } = createQueueMock();

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
      previousPatterns: ["25 * * * *"],
    });

    expect(removeRepeatable).toHaveBeenCalledTimes(2);
    expect(removeRepeatable).toHaveBeenCalledWith("my-job", {
      pattern: "*/15 * * * *",
    });
    expect(removeRepeatable).toHaveBeenCalledWith("my-job", {
      pattern: "25 * * * *",
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
