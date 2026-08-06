import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFailed: vi.fn(),
  getJobCounts: vi.fn(),
  recordGauge: vi.fn(),
  updateActiveIngestFailureProjectsMetric: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  QueueName: {
    TraceDelete: "trace-delete",
  },
  convertQueueNameToMetricName: (queueName: string) =>
    `langfuse.queue.${queueName.replace(/-/g, "_").replace(/_queue$/, "")}`,
  instrumentAsync: vi.fn(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  recordDistribution: vi.fn(),
  recordGauge: mocks.recordGauge,
  recordIncrement: vi.fn(),
  traceException: vi.fn(),
  updateActiveIngestFailureProjectsMetric:
    mocks.updateActiveIngestFailureProjectsMetric,
}));

vi.mock("../../env", () => ({
  env: {
    LANGFUSE_QUEUE_METRICS_INTERVAL_MS: 1_000,
  },
}));

vi.mock("../../queues/workerManager", () => ({
  WorkerManager: {
    computeDlqOldestAgeMs: vi.fn(() => 0),
    getRegisteredQueueNames: vi.fn(() => ["trace-delete"]),
  },
}));

vi.mock("../../queues/shardedQueueRegistry", () => ({
  SHARDED_QUEUES: [],
  SHARDED_QUEUE_BASE_NAMES: new Set(),
  resolveQueueInstance: vi.fn(() => ({
    getFailed: mocks.getFailed,
    getJobCounts: mocks.getJobCounts,
  })),
}));

import { QueueMetricsRunner } from ".";

class TestQueueMetricsRunner extends QueueMetricsRunner {
  public executeOnce(): Promise<void> {
    return this.execute();
  }
}

describe("QueueMetricsRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFailed.mockResolvedValue([]);
    mocks.getJobCounts.mockResolvedValue({
      active: 2,
      failed: 3,
      paused: 5,
      waiting: 7,
    });
    mocks.updateActiveIngestFailureProjectsMetric.mockResolvedValue(undefined);
  });

  it("emits only the canonical gauges for a non-sharded queue", async () => {
    await new TestQueueMetricsRunner().executeOnce();

    expect(mocks.getJobCounts).toHaveBeenCalledWith(
      "waiting",
      "paused",
      "failed",
      "active",
    );
    expect(mocks.recordGauge).toHaveBeenCalledTimes(4);
    expect(mocks.recordGauge).toHaveBeenCalledWith(
      "langfuse.queue.trace_delete.dlq_oldest_age",
      0,
      { unit: "milliseconds" },
    );
    expect(mocks.recordGauge).toHaveBeenCalledWith(
      "langfuse.queue.trace_delete.depth",
      12,
      { type: "waiting", unit: "records" },
    );
    expect(mocks.recordGauge).toHaveBeenCalledWith(
      "langfuse.queue.trace_delete.depth",
      3,
      { type: "failed", unit: "records" },
    );
    expect(mocks.recordGauge).toHaveBeenCalledWith(
      "langfuse.queue.trace_delete.depth",
      2,
      { type: "active", unit: "records" },
    );
    const legacyMetricNames = new Set([
      "langfuse.queue.trace_delete.length",
      "langfuse.queue.trace_delete.dlq_length",
      "langfuse.queue.trace_delete.active",
    ]);
    expect(
      mocks.recordGauge.mock.calls
        .map(([metricName]) => metricName)
        .filter((metricName) => legacyMetricNames.has(metricName)),
    ).toEqual([]);
  });
});
