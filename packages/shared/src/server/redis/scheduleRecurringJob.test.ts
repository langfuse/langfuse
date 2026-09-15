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

/** Legacy entries are keyed by a hash of the repeat options, never by name. */
const legacyEntry = (name: string, pattern: string, key: string) => ({
  key,
  name,
  pattern,
  endDate: null,
  tz: null,
  every: null,
  next: 0,
});

/** The job scheduler stores its entry under the scheduler id, i.e. the name. */
const schedulerEntry = (name: string, pattern: string) => ({
  key: name,
  name,
  pattern,
  endDate: null,
  tz: null,
  every: null,
  next: 0,
});

const createQueueMock = (
  repeatables: ReturnType<typeof legacyEntry>[] = [],
) => {
  const getRepeatableJobs = vi.fn().mockResolvedValue(repeatables);
  const removeRepeatableByKey = vi.fn().mockResolvedValue(true);
  const upsertJobScheduler = vi.fn().mockResolvedValue({});
  const queue = {
    name: "test-queue",
    getRepeatableJobs,
    removeRepeatableByKey,
    upsertJobScheduler,
  } as unknown as Queue;
  return {
    queue,
    getRepeatableJobs,
    removeRepeatableByKey,
    upsertJobScheduler,
  };
};

describe("scheduleRecurringJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes legacy schedules for the current and previous patterns before upserting", async () => {
    const { queue, removeRepeatableByKey, upsertJobScheduler } =
      createQueueMock([
        legacyEntry("my-job", "*/15 * * * *", "8f14e45fceea167a"),
        legacyEntry("my-job", "25 * * * *", "45c48cce2e2d7fbd"),
      ]);

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
      previousPatterns: ["25 * * * *"],
    });

    expect(removeRepeatableByKey).toHaveBeenCalledTimes(2);
    expect(removeRepeatableByKey).toHaveBeenCalledWith("8f14e45fceea167a");
    expect(removeRepeatableByKey).toHaveBeenCalledWith("45c48cce2e2d7fbd");
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "my-job",
      { pattern: "*/15 * * * *" },
      { name: "my-job", data: {} },
    );
    // The legacy cleanup must complete before the scheduler is upserted, so
    // a concurrently created legacy entry cannot outlive the migration.
    for (const removeCall of removeRepeatableByKey.mock.invocationCallOrder) {
      expect(removeCall).toBeLessThan(
        upsertJobScheduler.mock.invocationCallOrder[0]!,
      );
    }
  });

  it("never removes the job scheduler's own entry", async () => {
    // The scheduler shares the `repeat` sorted set with legacy entries and is
    // keyed by the scheduler id. Matching on name alone would delete the live
    // schedule this call is about to (re)create.
    const { queue, removeRepeatableByKey } = createQueueMock([
      schedulerEntry("my-job", "*/15 * * * *"),
    ]);

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
    });

    expect(removeRepeatableByKey).not.toHaveBeenCalled();
  });

  it("leaves other jobs and unrelated patterns alone", async () => {
    const { queue, removeRepeatableByKey } = createQueueMock([
      legacyEntry("other-job", "*/15 * * * *", "aaa111"),
      legacyEntry("my-job", "0 3 * * *", "bbb222"),
      legacyEntry("my-job", "*/15 * * * *", "ccc333"),
    ]);

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
    });

    expect(removeRepeatableByKey).toHaveBeenCalledTimes(1);
    expect(removeRepeatableByKey).toHaveBeenCalledWith("ccc333");
  });

  it("does not hash to locate legacy entries, so it works under FIPS", async () => {
    // Regression guard: Queue.removeRepeatable() recomputes an md5 digest to
    // find the entry, which throws ERR_OSSL_EVP_UNSUPPORTED when OpenSSL runs
    // in FIPS mode. The cleanup must go through the enumerate-then-remove-by-
    // key path instead, which never derives a key.
    const { queue, getRepeatableJobs, removeRepeatableByKey } = createQueueMock(
      [legacyEntry("my-job", "*/15 * * * *", "ddd444")],
    );
    (queue as unknown as { removeRepeatable: unknown }).removeRepeatable =
      vi.fn(() => {
        throw new Error("ERR_OSSL_EVP_UNSUPPORTED");
      });

    await scheduleRecurringJob(queue, {
      jobName: "my-job",
      pattern: "*/15 * * * *",
    });

    expect(getRepeatableJobs).toHaveBeenCalled();
    expect(removeRepeatableByKey).toHaveBeenCalledWith("ddd444");
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
    const { queue, getRepeatableJobs, upsertJobScheduler } = createQueueMock();
    getRepeatableJobs.mockRejectedValue(new Error("redis down"));

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
