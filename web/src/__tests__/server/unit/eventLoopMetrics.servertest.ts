import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";

const percentile = vi.hoisted(() => vi.fn(() => 1_800_000_000));
vi.mock("node:perf_hooks", () => ({
  monitorEventLoopDelay: () => ({
    count: 1,
    enable() {},
    disable() {},
    reset() {},
    percentile,
  }),
}));
// Use the real metric cache and publisher without loading unrelated server clients.
vi.mock(
  "@langfuse/shared/src/server",
  () => import("../../../../../packages/shared/src/server/instrumentation"),
);

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("delivers a stalled window even when another metric just flushed, then delivers recovery", async () => {
  vi.stubEnv("ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING", "true");
  vi.stubEnv("OTEL_SERVICE_NAME", "web-test");
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const requireFromShared = createRequire(
    new URL("../../../../../packages/shared/package.json", import.meta.url),
  );
  const { CloudWatchClient } = requireFromShared("@aws-sdk/client-cloudwatch");
  const send = vi
    .spyOn(CloudWatchClient.prototype, "send")
    .mockResolvedValue({});
  const { recordGauge } = await import("@langfuse/shared/src/server");
  const { startEventLoopMetrics, stopEventLoopMetrics } =
    await import("@/src/utils/eventLoopMetrics");
  stop = stopEventLoopMetrics;
  startEventLoopMetrics();

  vi.advanceTimersByTime(29_999);
  recordGauge("unrelated", 1);
  vi.advanceTimersByTime(1);
  percentile.mockReturnValue(20_000_000);
  vi.advanceTimersByTime(30_000);

  for (const value of [1800, 20]) {
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          MetricData: expect.arrayContaining([
            {
              MetricName: "langfuse.web-test.event_loop.delay.p95",
              Value: value,
            },
          ]),
        }),
      }),
    );
  }
});
