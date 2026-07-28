import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueueName } from "@langfuse/shared/src/server";

import {
  evaluateQueueConsumptionStuck,
  getQueueConsumptionHealth,
  markQueueJobActivity,
  markQueueWorkerRegistered,
  resetQueueConsumptionStateForTest,
} from "../features/health/queueConsumption";
import { WorkerManager } from "../queues/workerManager";

// Replace the BullMQ Worker with an EventEmitter so WorkerManager.register can
// be exercised without Redis, and job pickup/completion can be simulated by
// emitting the corresponding worker events.
vi.mock("bullmq", async (importOriginal) => {
  const mod = await importOriginal<typeof import("bullmq")>();
  const { EventEmitter: Emitter } = await import("node:events");

  class FakeWorker extends Emitter {
    constructor(
      public readonly name: string,
      public readonly processor: unknown,
      public readonly opts: unknown,
    ) {
      super();
    }

    isRunning(): boolean {
      return true;
    }

    async close(): Promise<void> {}
  }

  return { ...mod, Worker: FakeWorker };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...mod,
    createBullMQWorkerOptionsWithRedis: () => ({
      connection: {},
      prefix: "test",
    }),
  };
});

describe("evaluateQueueConsumptionStuck", () => {
  const nowMs = 1_700_000_000_000;
  const thresholdSeconds = 60 * 60;

  it("is not stuck when a job was processed recently", () => {
    const result = evaluateQueueConsumptionStuck({
      nowMs,
      registeredWorkerCount: 5,
      trackingSinceMs: nowMs - 2 * 60 * 60_000,
      lastActivityMs: nowMs - 60_000, // 1 min ago
      thresholdSeconds,
    });

    expect(result.stuck).toBe(false);
    expect(result.secondsSinceLastActivity).toBe(60);
    expect(result.lastActivityAt).toBe(new Date(nowMs - 60_000).toISOString());
  });

  it("is stuck when the last job activity exceeds the threshold", () => {
    const result = evaluateQueueConsumptionStuck({
      nowMs,
      registeredWorkerCount: 5,
      trackingSinceMs: nowMs - 3 * 60 * 60_000,
      lastActivityMs: nowMs - 2 * 60 * 60_000, // 2h ago > 1h
      thresholdSeconds,
    });

    expect(result.stuck).toBe(true);
    expect(result.secondsSinceLastActivity).toBe(2 * 60 * 60);
  });

  it("is not stuck exactly at the threshold (strictly greater than)", () => {
    const result = evaluateQueueConsumptionStuck({
      nowMs,
      registeredWorkerCount: 5,
      trackingSinceMs: nowMs - 2 * 60 * 60_000,
      lastActivityMs: nowMs - thresholdSeconds * 1000,
      thresholdSeconds,
    });

    expect(result.secondsSinceLastActivity).toBe(thresholdSeconds);
    expect(result.stuck).toBe(false);
  });

  it("measures from registration when no job has been processed yet", () => {
    // A worker that boots already wedged never processes a job. The baseline
    // is the first registration, so the probe still catches it after one full
    // threshold of grace.
    const freshBoot = evaluateQueueConsumptionStuck({
      nowMs,
      registeredWorkerCount: 5,
      trackingSinceMs: nowMs - 30 * 60_000, // 30 min ago
      lastActivityMs: null,
      thresholdSeconds,
    });
    expect(freshBoot.stuck).toBe(false);
    expect(freshBoot.secondsSinceLastActivity).toBe(30 * 60);

    const bootedWedged = evaluateQueueConsumptionStuck({
      nowMs,
      registeredWorkerCount: 5,
      trackingSinceMs: nowMs - 2 * 60 * 60_000, // 2h ago
      lastActivityMs: null,
      thresholdSeconds,
    });
    expect(bootedWedged.stuck).toBe(true);
    expect(bootedWedged.lastActivityAt).toBeNull();
  });

  it("is never stuck without registered workers (API-only container)", () => {
    const result = evaluateQueueConsumptionStuck({
      nowMs,
      registeredWorkerCount: 0,
      trackingSinceMs: null,
      lastActivityMs: null,
      thresholdSeconds,
    });

    expect(result.enabled).toBe(false);
    expect(result.stuck).toBe(false);
    expect(result.secondsSinceLastActivity).toBeNull();
  });
});

describe("queue consumption tracker", () => {
  beforeEach(() => {
    resetQueueConsumptionStateForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flips stuck after the (default 60 min) threshold and recovers on activity", () => {
    markQueueWorkerRegistered();

    expect(getQueueConsumptionHealth().enabled).toBe(true);
    expect(getQueueConsumptionHealth().stuck).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:59:00Z"));
    expect(getQueueConsumptionHealth().stuck).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T01:01:00Z"));
    expect(getQueueConsumptionHealth().stuck).toBe(true);

    markQueueJobActivity();
    expect(getQueueConsumptionHealth().stuck).toBe(false);
  });

  it("counts registered workers", () => {
    markQueueWorkerRegistered();
    markQueueWorkerRegistered();

    expect(getQueueConsumptionHealth().registeredWorkerCount).toBe(2);
  });
});

describe("WorkerManager liveness wiring", () => {
  beforeEach(() => {
    resetQueueConsumptionStateForTest();
  });

  const getEmitter = (queueName: QueueName): EventEmitter =>
    WorkerManager.getWorker(queueName) as unknown as EventEmitter;

  it("marks registration and stamps activity on job pickup and completion", () => {
    WorkerManager.register(QueueName.NotificationQueue, async () => {});

    const health = getQueueConsumptionHealth();
    expect(health.enabled).toBe(true);
    expect(health.registeredWorkerCount).toBe(1);
    expect(health.lastActivityAt).toBeNull();

    getEmitter(QueueName.NotificationQueue).emit("active");
    const afterActive = getQueueConsumptionHealth();
    expect(afterActive.lastActivityAt).not.toBeNull();

    getEmitter(QueueName.NotificationQueue).emit("completed");
    expect(getQueueConsumptionHealth().lastActivityAt).not.toBeNull();
  });

  it("does not stamp activity on failed events (stalled-checker emits those)", () => {
    WorkerManager.register(QueueName.WebhookQueue, async () => {});

    getEmitter(QueueName.WebhookQueue).emit(
      "failed",
      undefined,
      new Error("stalled beyond limit"),
    );

    expect(getQueueConsumptionHealth().lastActivityAt).toBeNull();
  });
});
