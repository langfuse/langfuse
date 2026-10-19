import { randomUUID } from "crypto";

import { Queue, Worker } from "bullmq";
import { describe, expect, it } from "vitest";

import {
  createNewRedisInstance,
  getQueuePrefix,
  QueueName,
  redisQueueRetryOptions,
} from "@langfuse/shared/src/server";
import { WorkerManager } from "../queues/workerManager";

const extractProjectId = (data: unknown): string | undefined =>
  (
    WorkerManager as unknown as {
      extractProjectId(job: { data: unknown }): string | undefined;
    }
  ).extractProjectId({ data });

const computeDlqOldestAgeMs = (jobs: unknown[], nowMs: number): number =>
  WorkerManager.computeDlqOldestAgeMs(
    jobs as Parameters<typeof WorkerManager.computeDlqOldestAgeMs>[0],
    nowMs,
  );

const computeWaitTimeMs = (job: unknown, nowMs: number) =>
  WorkerManager.computeWaitTimeMs(
    job as Parameters<typeof WorkerManager.computeWaitTimeMs>[0],
    nowMs,
  );

const resolveMetricInfo = (queueName: QueueName) =>
  (
    WorkerManager as unknown as {
      resolveMetricInfo(queueName: QueueName): {
        baseMetric: string;
      };
    }
  ).resolveMetricInfo(queueName);

describe("WorkerManager", () => {
  describe("extractProjectId", () => {
    it("extracts project ids from queue payloads", () => {
      expect(
        extractProjectId({
          payload: { projectId: "project-from-payload" },
        }),
      ).toBe("project-from-payload");
    });

    it("extracts ingestion project ids from payload auth scope", () => {
      expect(
        extractProjectId({
          payload: {
            authCheck: {
              scope: { projectId: "project-from-auth-scope" },
            },
          },
        }),
      ).toBe("project-from-auth-scope");
    });

    it("ignores non-contract top-level project ids", () => {
      expect(
        extractProjectId({
          projectId: "top-level-project",
        }),
      ).toBeUndefined();
    });

    it("ignores non-contract top-level auth scope project ids", () => {
      expect(
        extractProjectId({
          authCheck: {
            scope: { projectId: "top-level-auth-project" },
          },
        }),
      ).toBeUndefined();
    });
  });

  describe("resolveMetricInfo", () => {
    it("uses the base metric as the worker ClickHouse route", () => {
      expect(resolveMetricInfo(QueueName.TraceDelete).baseMetric).toBe(
        "langfuse.queue.trace_delete",
      );
    });

    it("uses the base metric as the worker ClickHouse route for sharded queues", () => {
      expect(
        resolveMetricInfo(`${QueueName.IngestionQueue}-1` as QueueName)
          .baseMetric,
      ).toBe("langfuse.queue.ingestion");
    });
  });

  describe("computeDlqOldestAgeMs", () => {
    it("returns 0 for an empty failed set", () => {
      expect(computeDlqOldestAgeMs([], 5_000)).toBe(0);
    });

    it("measures age from the first job's finishedOn", () => {
      expect(
        computeDlqOldestAgeMs([{ finishedOn: 1_000, timestamp: 500 }], 4_000),
      ).toBe(3_000);
    });

    it("falls back to timestamp when finishedOn is missing", () => {
      expect(computeDlqOldestAgeMs([{ timestamp: 500 }], 4_000)).toBe(3_500);
    });

    it("skips undefined entries from stale job ids", () => {
      expect(
        computeDlqOldestAgeMs([undefined, { finishedOn: 1_000 }], 4_000),
      ).toBe(3_000);
    });
  });

  describe("computeWaitTimeMs", () => {
    // BullMQ increments attemptsStarted when it moves the job to active, so
    // the processor sees 1 on the first pickup.
    const firstPickup = {
      timestamp: 1_000,
      opts: {},
      attemptsMade: 0,
      attemptsStarted: 1,
      stalledCounter: 0,
    };

    it("measures a first attempt from job creation", () => {
      expect(computeWaitTimeMs(firstPickup, 4_000)).toEqual({
        attempt: "first",
        waitMs: 3_000,
      });
    });

    it("excludes an intentional delay from a delayed job's wait", () => {
      // BullMQ resets job.delay to 0 when it promotes the job, so only
      // opts.delay still carries the original delay at pickup.
      expect(
        computeWaitTimeMs(
          { ...firstPickup, delay: 0, opts: { delay: 10_000 } },
          12_500,
        ),
      ).toEqual({ attempt: "first", waitMs: 1_500 });
    });

    it("clamps to 0 when a delayed job is picked up early", () => {
      expect(
        computeWaitTimeMs({ ...firstPickup, opts: { delay: 10_000 } }, 10_000),
      ).toEqual({ attempt: "first", waitMs: 0 });
    });

    it("does not fold earlier attempts and backoff into a retry's wait", () => {
      // Created at 1s, ran for an hour, failed, backed off, picked up again.
      expect(
        computeWaitTimeMs(
          {
            ...firstPickup,
            attemptsMade: 1,
            attemptsStarted: 2,
            processedOn: 3_700_000,
          },
          3_700_000,
        ),
      ).toEqual({ attempt: "retry", waitMs: undefined });
    });

    it("treats a stall re-run as a retry even though attemptsMade is 0", () => {
      // The worker host died mid-run; the stalled checker moved the job back
      // to wait without counting a failed attempt.
      expect(
        computeWaitTimeMs(
          {
            ...firstPickup,
            attemptsMade: 0,
            attemptsStarted: 2,
            stalledCounter: 1,
          },
          7_200_000,
        ),
      ).toEqual({ attempt: "retry", waitMs: undefined });
    });

    it("treats a re-pickup without a stall count as a retry", () => {
      // e.g. moveJobFromActiveToWait or a manual job.retry() that keeps
      // attemptsStarted.
      expect(
        computeWaitTimeMs({ ...firstPickup, attemptsStarted: 3 }, 7_200_000),
      ).toEqual({ attempt: "retry", waitMs: undefined });
    });

    it.each([
      ["attemptsMade", { attemptsMade: 1, stalledCounter: 0 }],
      ["stalledCounter", { attemptsMade: 0, stalledCounter: 1 }],
    ])(
      "detects a retry from %s alone when attemptsStarted is missing",
      (_field, counters) => {
        expect(
          computeWaitTimeMs(
            { timestamp: 1_000, opts: {}, ...counters },
            7_200_000,
          ),
        ).toEqual({ attempt: "retry", waitMs: undefined });
      },
    );
  });

  describe("dlq oldest job lookup", () => {
    it("getFailed returns newest-first, so index -1 is the oldest job", async () => {
      const queueName = `dlq-oldest-age-${randomUUID()}`;
      const redis = createNewRedisInstance({
        enableOfflineQueue: false,
        ...redisQueueRetryOptions,
      });
      if (!redis) throw new Error("Failed to create redis instance");

      const queue = new Queue(queueName, {
        connection: redis,
        prefix: getQueuePrefix(queueName),
      });
      const worker = new Worker(
        queueName,
        async () => {
          throw new Error("always fails");
        },
        { connection: redis, prefix: getQueuePrefix(queueName) },
      );

      const waitForFailedCount = async (expected: number) => {
        const deadline = Date.now() + 15_000;
        while ((await queue.getFailedCount()) < expected) {
          if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for ${expected} failed jobs`);
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      };

      try {
        await queue.add("job", { order: "oldest" });
        await waitForFailedCount(1);
        // Failure timestamps have ms resolution; keep them distinct.
        await new Promise((resolve) => setTimeout(resolve, 10));
        await queue.add("job", { order: "newest" });
        await waitForFailedCount(2);

        const newestFirst = await queue.getFailed();
        expect(newestFirst.map((job) => job.data.order)).toEqual([
          "newest",
          "oldest",
        ]);

        const [oldest] = await queue.getFailed(-1, -1);
        expect(oldest.data.order).toBe("oldest");
        expect(oldest.finishedOn).toBeDefined();
        expect(oldest.finishedOn!).toBeLessThan(newestFirst[0].finishedOn!);
      } finally {
        await worker.close();
        await queue.obliterate({ force: true });
        await queue.close();
        redis.disconnect();
      }
    }, 30_000);
  });
});
