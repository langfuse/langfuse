import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  flushMetricsToCloudWatch: vi.fn(),
  getFailed: vi.fn(),
  getJobCounts: vi.fn(),
  getRanges: vi.fn(),
  hmget: vi.fn(),
  recordGauge: vi.fn(),
  recordIncrement: vi.fn(),
  redisSet: vi.fn(),
  updateActiveIngestFailureProjectsMetric: vi.fn(),
  emitV4LegacyApiUsageFreshnessMetrics: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  QueueName: {
    TraceDelete: "trace-delete",
  },
  contextWithLangfuseProps: vi.fn(),
  convertQueueNameToMetricName: (queueName: string) =>
    `langfuse.queue.${queueName.replace(/-/g, "_").replace(/_queue$/, "")}`,
  flushMetricsToCloudWatch: mocks.flushMetricsToCloudWatch,
  instrumentAsync: (
    _options: unknown,
    fn: (span: { setAttribute: () => void }) => Promise<unknown>,
  ) => fn({ setAttribute: vi.fn() }),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  recordDistribution: vi.fn(),
  recordGauge: mocks.recordGauge,
  recordIncrement: mocks.recordIncrement,
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
    computeOldestWaitingAgeMs: vi.fn(() => 4_000),
    getRegisteredQueueNames: vi.fn(() => ["trace-delete"]),
  },
}));

vi.mock("../../queues/shardedQueueRegistry", () => ({
  SHARDED_QUEUES: [],
  SHARDED_QUEUE_BASE_NAMES: new Set(),
  resolveQueueInstance: vi.fn(() => ({
    getFailed: mocks.getFailed,
    getJobCounts: mocks.getJobCounts,
    getRanges: mocks.getRanges,
    client: Promise.resolve({ hmget: mocks.hmget }),
    toKey: (id: string) => `bull:trace-delete:${id}`,
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
    mocks.getRanges.mockResolvedValue(["job-1"]);
    mocks.hmget.mockResolvedValue(["1000", "{}"]);
    mocks.getJobCounts.mockResolvedValue({
      active: 2,
      failed: 3,
      paused: 5,
      waiting: 7,
    });
    mocks.updateActiveIngestFailureProjectsMetric.mockResolvedValue(undefined);
    mocks.emitV4LegacyApiUsageFreshnessMetrics.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(mocks.recordGauge).toHaveBeenCalledTimes(6);
    expect(mocks.recordGauge).toHaveBeenCalledWith(
      "langfuse.queue.trace_delete.dlq_oldest_age",
      0,
      { unit: "milliseconds" },
    );
    expect(mocks.getRanges).toHaveBeenCalledWith(
      ["wait", "paused", "prioritized"],
      0,
      0,
      true,
    );
    expect(mocks.hmget).toHaveBeenCalledWith(
      "bull:trace-delete:job-1",
      "timestamp",
      "opts",
    );
    expect(WorkerManager.computeOldestWaitingAgeMs).toHaveBeenCalledWith(
      [{ timestamp: "1000", opts: "{}" }],
      expect.any(Number),
    );
    expect(mocks.recordGauge).toHaveBeenCalledWith(
      "langfuse.queue.trace_delete.oldest_waiting_age_ms",
      4_000,
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

  it("emits 0 oldest waiting age without reading job hashes when nothing waits", async () => {
    mocks.getRanges.mockResolvedValue([]);

    await new TestQueueMetricsRunner().executeOnce();

    expect(mocks.hmget).not.toHaveBeenCalled();
    expect(mocks.recordGauge).toHaveBeenCalledWith(
      "langfuse.queue.trace_delete.oldest_waiting_age_ms",
      0,
      { unit: "milliseconds" },
    );
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
    expect(mocks.getRanges).not.toHaveBeenCalled();
    expect(
      mocks.updateActiveIngestFailureProjectsMetric,
    ).not.toHaveBeenCalled();
    expect(mocks.recordGauge).not.toHaveBeenCalled();
    expect(mocks.flushMetricsToCloudWatch).not.toHaveBeenCalled();
  });

  it("polls without a claim and records a failed run when the claim errors", async () => {
    mocks.redisSet.mockRejectedValue(new Error("OOM command not allowed"));
    const runner = new QueueMetricsRunner();

    runner.start();
    await vi.waitFor(() =>
      expect(mocks.recordIncrement).toHaveBeenCalledWith(
        "langfuse.periodic_runner.completed",
        1,
        { runner: "queue_metrics_runner", outcome: "failed" },
      ),
    );
    runner.stop();

    expect(mocks.getJobCounts).toHaveBeenCalledTimes(1);
    expect(mocks.recordGauge).toHaveBeenCalledWith(
      "langfuse.queue.trace_delete.depth",
      12,
      { type: "waiting", unit: "records" },
    );
  });

  it("flushes CloudWatch at most once per flush floor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const runner = new TestQueueMetricsRunner();

    await runner.executeOnce();
    vi.setSystemTime(new Date("2026-01-01T00:00:09Z"));
    await runner.executeOnce();
    expect(mocks.flushMetricsToCloudWatch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:00:10Z"));
    await runner.executeOnce();
    expect(mocks.flushMetricsToCloudWatch).toHaveBeenCalledTimes(2);
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
