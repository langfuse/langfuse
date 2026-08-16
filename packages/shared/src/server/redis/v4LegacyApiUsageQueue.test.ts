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

  it("removes the legacy hourly repeatable job before scheduling */15", async () => {
    const removeRepeatable = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn();

    vi.doMock("bullmq", () => ({
      Queue: class {
        removeRepeatable = removeRepeatable;
        add = add;
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

    expect(removeRepeatable).toHaveBeenCalledWith(
      QueueJobs.V4LegacyApiUsageJob,
      { pattern: "25 * * * *" },
    );
    expect(add).toHaveBeenCalledWith(
      QueueJobs.V4LegacyApiUsageJob,
      {},
      { repeat: { pattern: V4_LEGACY_API_USAGE_CRON_PATTERN } },
    );
    expect(V4_LEGACY_API_USAGE_CRON_PATTERN).toBe("*/15 * * * *");
    expect(removeRepeatable.mock.invocationCallOrder[0]).toBeLessThan(
      add.mock.invocationCallOrder[0]!,
    );
  });
});
