import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  flushMetricsToCloudWatch: vi.fn(),
  getFailed: vi.fn(),
  getJobCounts: vi.fn(),
  recordGauge: vi.fn(),
  redisSet: vi.fn(),
  updateActiveIngestFailureProjectsMetric: vi.fn(),
  emitV4LegacyApiUsageFreshnessMetrics: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  QueueName: {
    TraceDelete: "trace-delete",
  },
  convertQueueNameToMetricName: (queueName: string) =>
    `langfuse.queue.${queueName.replace(/-/g, "_").replace(/_queue$/, "")}`,
  flushMetricsToCloudWatch: mocks.flushMetricsToCloudWatch,
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
  redis: { set: mocks.redisSet },
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

vi.mock("@langfuse/shared/topics/server", () => ({
  emitTopicStagingMetrics: vi.fn(),
}));

vi.mock("../v4/v4LegacyApiUsageMetrics", () => ({
  emitV4LegacyApiUsageFreshnessMetrics:
    mocks.emitV4LegacyApiUsageFreshnessMetrics,
}));

import { QueueMetricsRunner } from ".";
import { WorkerManager } from "../../queues/workerManager";

class TestQueueMetricsRunner extends QueueMetricsRunner {
  public executeOnce(): Promise<void> {
    return this.execute();
  }
}

describe("QueueMetricsRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisSet.mockResolvedValue("OK");
    mocks.getFailed.mockResolvedValue([]);
    mocks.getJobCounts.mockResolvedValue({
      active: 2,
      failed: 3,
      paused: 5,
      waiting: 7,
    });
    mocks.updateActiveIngestFailureProjectsMetric.mockResolvedValue(undefined);
    mocks.emitV4LegacyApiUsageFreshnessMetrics.mockResolvedValue(undefined);
  });

  it("emits only the canonical gauges for a non-sharded queue", async () => {
    await new TestQueueMetricsRunner().executeOnce();

    expect(mocks.getJobCounts).toHaveBeenCalledWith(
      "waiting",
      "paused",
      "failed",
      "active",
      "delayed",
    );
    expect(mocks.recordGauge).toHaveBeenCalledTimes(5);
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
    expect(mocks.flushMetricsToCloudWatch).toHaveBeenCalledTimes(1);
  });

  it("polls nothing when another worker already claimed the interval", async () => {
    mocks.redisSet.mockResolvedValue(null);

    await new TestQueueMetricsRunner().executeOnce();

    expect(mocks.redisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^langfuse:queue-metrics-runner:claim:/),
      expect.any(String),
      "PX",
      900,
      "NX",
    );
    expect(mocks.getJobCounts).not.toHaveBeenCalled();
    expect(mocks.getFailed).not.toHaveBeenCalled();
    expect(
      mocks.updateActiveIngestFailureProjectsMetric,
    ).not.toHaveBeenCalled();
    expect(mocks.recordGauge).not.toHaveBeenCalled();
    expect(mocks.flushMetricsToCloudWatch).not.toHaveBeenCalled();
  });

  it("claims separately for workers that consume different queues", async () => {
    vi.mocked(WorkerManager.getRegisteredQueueNames)
      .mockReturnValueOnce(["trace-delete"])
      .mockReturnValueOnce(["score-delete", "trace-delete"])
      .mockReturnValueOnce(["trace-delete", "score-delete"]);

    for (let i = 0; i < 3; i++) {
      await new TestQueueMetricsRunner().executeOnce();
    }

    const [single, pair, samePairReordered] = mocks.redisSet.mock.calls.map(
      ([key]) => key,
    );
    expect(pair).not.toEqual(single);
    expect(samePairReordered).toEqual(pair);
  });
});
