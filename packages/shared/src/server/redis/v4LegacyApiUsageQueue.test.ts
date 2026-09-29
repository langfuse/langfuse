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
    const removeRepeatable = vi.fn().mockResolvedValue(true);
    const upsertJobScheduler = vi.fn().mockResolvedValue({});
    const on = vi.fn();

    vi.doMock("bullmq", () => ({
      Queue: class {
        removeRepeatable = removeRepeatable;
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

    V4LegacyApiUsageQueue.getInstance();

    // Scheduling is fire-and-forget from getInstance, so wait for the chain.
    await vi.waitFor(() => {
      expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    });

    // Legacy repeatable entries are keyed by md5(name + pattern), so both the
    // current pattern and the pre-migration hourly pattern must be cleaned up.
    expect(removeRepeatable).toHaveBeenCalledWith(
      QueueJobs.V4LegacyApiUsageJob,
      { pattern: V4_LEGACY_API_USAGE_CRON_PATTERN },
    );
    expect(removeRepeatable).toHaveBeenCalledWith(
      QueueJobs.V4LegacyApiUsageJob,
      { pattern: "25 * * * *" },
    );
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      QueueJobs.V4LegacyApiUsageJob,
      { pattern: V4_LEGACY_API_USAGE_CRON_PATTERN },
      { name: QueueJobs.V4LegacyApiUsageJob, data: {} },
    );
    expect(V4_LEGACY_API_USAGE_CRON_PATTERN).toBe("*/15 * * * *");
    for (const removeCall of removeRepeatable.mock.invocationCallOrder) {
      expect(removeCall).toBeLessThan(
        upsertJobScheduler.mock.invocationCallOrder[0]!,
      );
    }
  });
});
