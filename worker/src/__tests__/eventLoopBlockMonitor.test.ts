import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordDistribution: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { warn: mocks.warn },
  recordDistribution: mocks.recordDistribution,
}));
vi.mock("../utils/hostId", () => ({ WORKER_HOST_ID: "test-host" }));

import { EventLoopBlockMonitor } from "../queues/eventLoopBlockMonitor";

describe("EventLoopBlockMonitor", () => {
  let clock = 0;
  let monitor: EventLoopBlockMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    monitor?.stop();
    clock = 0;
    monitor = new EventLoopBlockMonitor(() => clock, "test-host");
    monitor.start();
  });

  it("attributes a long block to jobs active during it, including one that settled", () => {
    const finish = monitor.track({
      queueName: "topics-update",
      baseMetric: "langfuse.queue.topics_update",
      jobId: "execution-1",
      projectId: "project-1",
    });
    clock = 10_000;
    monitor.track({
      queueName: "ingestion-queue",
      baseMetric: "langfuse.queue.ingestion",
      jobId: "ingestion-1",
    });
    clock = 70_500; // the 500ms tick fired 70s late
    finish();
    monitor.tick();

    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.queue.topics_update.event_loop_blocked_ms",
      70_000,
      { unit: "milliseconds" },
    );
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(mocks.warn.mock.calls[0][0]).toContain(
      "topics-update/execution-1 projectId=project-1",
    );
    expect(mocks.warn.mock.calls[0][1]).toMatchObject({
      blockedMs: 70_000,
      activeJobCount: 2,
      topJobId: "execution-1",
    });
  });

  it("ignores normal drift and only counts short blocks", () => {
    clock = 900; // 400ms late
    monitor.tick();
    expect(mocks.recordDistribution).not.toHaveBeenCalled();

    clock += 3_000; // 2.5s late
    monitor.tick();
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.worker.event_loop_blocked_ms",
      2_500,
      { unit: "milliseconds", attributed: "false" },
    );
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
