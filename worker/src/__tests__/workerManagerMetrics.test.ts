import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  processor: undefined as
    | ((job: { data: unknown; timestamp: number }) => Promise<unknown>)
    | undefined,
  legacyRecordGauge: vi.fn(),
  legacyRecordHistogram: vi.fn(),
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Job: class {},
  Worker: class {
    constructor(
      _queueName: string,
      processor: (job: {
        data: unknown;
        timestamp: number;
      }) => Promise<unknown>,
    ) {
      mocks.processor = processor;
    }

    close = vi.fn(async () => undefined);
    isRunning = vi.fn(() => true);
    on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      mocks.handlers.set(event, handler);
    });
  },
}));

vi.mock("@opentelemetry/api", () => ({
  context: {
    with: (_context: unknown, callback: () => unknown) => callback(),
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  QueueName: {
    TraceDelete: "trace-delete",
  },
  contextWithLangfuseProps: vi.fn(() => ({})),
  convertQueueNameToMetricName: (queueName: string) =>
    `langfuse.queue.${queueName.replace(/-/g, "_").replace(/_queue$/, "")}`,
  createBullMQWorkerOptionsWithRedis: vi.fn(() => ({ connection: {} })),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  recordGauge: mocks.legacyRecordGauge,
  recordHistogram: mocks.legacyRecordHistogram,
  recordDistribution: mocks.recordDistribution,
  recordIncrement: mocks.recordIncrement,
  traceException: vi.fn(),
}));

vi.mock("../queues/shardedQueueRegistry", () => ({
  resolveQueueInstance: vi.fn(() => ({
    getActiveCount: vi.fn(async () => 0),
    getFailed: vi.fn(async () => []),
    getFailedCount: vi.fn(async () => 0),
    getWaitingCount: vi.fn(async () => 0),
  })),
  SHARDED_QUEUE_BASE_NAMES: new Set(),
}));

vi.mock("../utils/hostId", () => ({
  WORKER_HOST_ID: "test-host",
}));

import { WorkerManager } from "../queues/workerManager";

describe("WorkerManager queue metrics", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.processor = undefined;
    vi.clearAllMocks();
  });

  it("emits only tagged rate and time metrics", async () => {
    WorkerManager.register("trace-delete" as never, async () => "processed");

    expect(mocks.processor).toBeDefined();
    await expect(
      mocks.processor!({
        data: { payload: { projectId: "project-id" } },
        timestamp: Date.now() - 50,
      }),
    ).resolves.toBe("processed");
    await Promise.resolve();

    expect(mocks.recordIncrement.mock.calls).toEqual([
      ["langfuse.queue.trace_delete.rate", 1, { type: "request" }],
    ]);
    expect(
      mocks.recordDistribution.mock.calls.map(([metric, _value, tags]) => [
        metric,
        tags,
      ]),
    ).toEqual([
      [
        "langfuse.queue.trace_delete.time_distribution",
        { type: "wait", unit: "milliseconds" },
      ],
      [
        "langfuse.queue.trace_delete.time_distribution",
        { type: "processing", unit: "milliseconds" },
      ],
    ]);
    expect(mocks.legacyRecordGauge).not.toHaveBeenCalled();
    expect(mocks.legacyRecordHistogram).not.toHaveBeenCalled();

    mocks.recordIncrement.mockClear();
    mocks.handlers.get("failed")?.(
      { id: "job-id", name: "job" },
      new Error("failed"),
    );
    mocks.handlers.get("error")?.(new Error("errored"));
    mocks.handlers.get("stalled")?.("job-id");

    expect(mocks.recordIncrement.mock.calls).toEqual([
      ["langfuse.queue.trace_delete.rate", 1, { type: "failed" }],
      ["langfuse.queue.trace_delete.rate", 1, { type: "error" }],
      ["langfuse.queue.trace_delete.rate", 1, { type: "stalled" }],
    ]);
  });
});
