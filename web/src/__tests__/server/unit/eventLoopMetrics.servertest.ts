import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  histogram: {
    count: 1,
    enable: vi.fn(),
    disable: vi.fn(),
    percentile: vi.fn(() => 900_000_000),
    reset: vi.fn(),
  },
  recordGauge: vi.fn(),
  sharedEnv: { ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING: "true" },
}));

vi.mock("node:perf_hooks", () => ({
  monitorEventLoopDelay: () => mocks.histogram,
}));
vi.mock("@/src/env.mjs", () => ({ env: { OTEL_SERVICE_NAME: "web-test" } }));
vi.mock("@langfuse/shared/src/env", () => ({ env: mocks.sharedEnv }));
vi.mock("@langfuse/shared/src/server", () => ({
  recordGauge: mocks.recordGauge,
}));

import {
  startEventLoopMetrics,
  stopEventLoopMetrics,
} from "@/src/utils/eventLoopMetrics";

describe("event-loop metrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.histogram.count = 1;
    mocks.sharedEnv.ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING = "true";
  });

  afterEach(() => {
    stopEventLoopMetrics();
    vi.useRealTimers();
  });

  it("publishes service-specific milliseconds once per window and resets the histogram", () => {
    startEventLoopMetrics();
    startEventLoopMetrics();
    vi.advanceTimersByTime(30_000);
    expect(mocks.histogram.enable).toHaveBeenCalledTimes(1);
    expect(mocks.histogram.percentile).toHaveBeenCalledWith(95);
    expect(mocks.recordGauge).toHaveBeenCalledExactlyOnceWith(
      "langfuse.web-test.event_loop.delay.p95",
      900,
      { unit: "millisecond" },
    );
    expect(mocks.histogram.reset).toHaveBeenCalledTimes(1);

    stopEventLoopMetrics();
    vi.advanceTimersByTime(30_000);
    expect(mocks.histogram.disable).toHaveBeenCalledTimes(1);
    expect(mocks.recordGauge).toHaveBeenCalledTimes(1);
  });

  it("does not turn an empty histogram into a healthy autoscaling signal", () => {
    mocks.histogram.count = 0;
    startEventLoopMetrics();
    vi.advanceTimersByTime(30_000);
    expect(mocks.recordGauge).not.toHaveBeenCalled();
  });

  it("does not start monitoring when CloudWatch publishing is disabled", () => {
    mocks.sharedEnv.ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING = "false";
    startEventLoopMetrics();
    vi.advanceTimersByTime(60_000);
    expect(mocks.histogram.enable).not.toHaveBeenCalled();
    expect(mocks.recordGauge).not.toHaveBeenCalled();
  });
});
