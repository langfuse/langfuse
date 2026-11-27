import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("V4LegacyApiUsageQueue schedule", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("bullmq");
    vi.doUnmock("./redis");
    vi.doUnmock("../logger");
    vi.clearAllMocks();
  });

  it("removes the legacy repeatable schedules and upserts a job scheduler", async () => {
    const getRepeatableJobs = vi.fn();
    const removeRepeatableByKey = vi.fn().mockResolvedValue(true);
    const upsertJobScheduler = vi.fn().mockResolvedValue({});
    const on = vi.fn();

    vi.doMock("bullmq", () => ({
      Queue: class {
        getRepeatableJobs = getRepeatableJobs;
        removeRepeatableByKey = removeRepeatableByKey;
        upsertJobScheduler = upsertJobScheduler;
        on = on;
      },
    }));

    vi.doMock("./redis", () => ({
      createBullMQQueueOptionsWithRedis: vi.fn(() => ({
        connection: {},
        prefix: "test",
      })),
    }));

    vi.doMock("../logger", () => ({
      logger: {
        debug: vi.fn(),
        error: vi.fn(),
      },
    }));

    const { V4LegacyApiUsageQueue, V4_LEGACY_API_USAGE_CRON_PATTERN } =
      await import("./v4LegacyApiUsageQueue.js");
    const { QueueJobs } = await import("../queues.js");

    // Legacy repeatable entries are stored under a hash of their repeat
    // options, one per pattern the job was ever scheduled with.
    getRepeatableJobs.mockResolvedValue([
      {
        key: "legacy-current-pattern",
        name: QueueJobs.V4LegacyApiUsageJob,
        pattern: V4_LEGACY_API_USAGE_CRON_PATTERN,
      },
      {
        key: "legacy-hourly-pattern",
        name: QueueJobs.V4LegacyApiUsageJob,
        pattern: "25 * * * *",
      },
    ]);

    V4LegacyApiUsageQueue.getInstance();

    // Scheduling is fire-and-forget from getInstance, so wait for the chain.
    await vi.waitFor(() => {
      expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    });

    // Both the current pattern and the pre-migration hourly pattern must be
    // cleaned up, by their stored keys.
    expect(removeRepeatableByKey).toHaveBeenCalledTimes(2);
    expect(removeRepeatableByKey).toHaveBeenCalledWith(
      "legacy-current-pattern",
    );
    expect(removeRepeatableByKey).toHaveBeenCalledWith("legacy-hourly-pattern");
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      QueueJobs.V4LegacyApiUsageJob,
      { pattern: V4_LEGACY_API_USAGE_CRON_PATTERN },
      { name: QueueJobs.V4LegacyApiUsageJob, data: {} },
    );
    expect(V4_LEGACY_API_USAGE_CRON_PATTERN).toBe("*/15 * * * *");
    for (const removeCall of removeRepeatableByKey.mock.invocationCallOrder) {
      expect(removeCall).toBeLessThan(
        upsertJobScheduler.mock.invocationCallOrder[0]!,
      );
    }
  });
});
