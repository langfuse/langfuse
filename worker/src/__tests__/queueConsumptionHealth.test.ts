import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueueName } from "@langfuse/shared/src/server";

import {
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

beforeEach(() => {
  resetQueueConsumptionStateForTest();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("queue consumption liveness", () => {
  it("flips stuck after the (default 60 min) threshold and recovers on activity", () => {
    markQueueWorkerRegistered();

    expect(getQueueConsumptionHealth().enabled).toBe(true);
    expect(getQueueConsumptionHealth().stuck).toBe(false);

    // Boot grace: measured from registration while no job has run yet.
    vi.setSystemTime(new Date("2026-01-01T00:59:00Z"));
    expect(getQueueConsumptionHealth().stuck).toBe(false);

    // A worker that never processes anything (e.g. booted wedged) is caught.
    vi.setSystemTime(new Date("2026-01-01T01:01:00Z"));
    expect(getQueueConsumptionHealth().stuck).toBe(true);

    markQueueJobActivity();
    expect(getQueueConsumptionHealth().stuck).toBe(false);
  });

  it("is never stuck without registered workers (API-only container)", () => {
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z")); // far past any threshold

    const health = getQueueConsumptionHealth();
    expect(health.enabled).toBe(false);
    expect(health.stuck).toBe(false);
  });
});

describe("WorkerManager liveness wiring", () => {
  const getEmitter = (queueName: QueueName): EventEmitter =>
    WorkerManager.getWorker(queueName) as unknown as EventEmitter;

  it("marks registration and stamps activity on job pickup and completion", () => {
    WorkerManager.register(QueueName.NotificationQueue, async () => {});

    expect(getQueueConsumptionHealth().enabled).toBe(true);
    expect(getQueueConsumptionHealth().lastActivityAt).toBeNull();

    getEmitter(QueueName.NotificationQueue).emit("active");
    expect(getQueueConsumptionHealth().lastActivityAt).toBe(
      "2026-01-01T00:00:00.000Z",
    );

    // "completed" must stamp on its own: the timestamp advances past the
    // pickup stamp, so a long-running job refreshes liveness when it settles.
    vi.setSystemTime(new Date("2026-01-01T00:05:00Z"));
    getEmitter(QueueName.NotificationQueue).emit("completed");
    expect(getQueueConsumptionHealth().lastActivityAt).toBe(
      "2026-01-01T00:05:00.000Z",
    );
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
