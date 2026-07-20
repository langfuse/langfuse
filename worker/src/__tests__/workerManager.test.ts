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
  (
    WorkerManager as unknown as {
      computeDlqOldestAgeMs(jobs: unknown[], nowMs: number): number;
    }
  ).computeDlqOldestAgeMs(jobs, nowMs);

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
