import { monitorEventLoopDelay } from "node:perf_hooks";
import { env } from "@/src/env.mjs";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import {
  flushMetricsToCloudWatch,
  recordGauge,
} from "@langfuse/shared/src/server";

let stopMonitoring: (() => void) | undefined;

export function startEventLoopMetrics() {
  if (
    stopMonitoring ||
    sharedEnv.ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING !== "true"
  ) {
    return;
  }

  // Report raw timer delay, including the approximately 20 ms sampling floor.
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const timer = setInterval(() => {
    // Empty windows must not publish a healthy value to an autoscaler.
    if (histogram.count === 0) return;
    const delayMs = histogram.percentile(95) / 1_000_000;
    histogram.reset();
    // CloudWatch gauges do not retain tags; the service must be in the name
    // so independent web services never share an autoscaling signal.
    recordGauge(
      `langfuse.${env.OTEL_SERVICE_NAME}.event_loop.delay.p95`,
      delayMs,
      { unit: "millisecond" },
    );
    // Publish this window before a later gauge can replace it in the cache.
    flushMetricsToCloudWatch();
  }, 30_000);
  timer.unref();

  stopMonitoring = () => {
    clearInterval(timer);
    histogram.disable();
  };
}

export function stopEventLoopMetrics() {
  stopMonitoring?.();
  stopMonitoring = undefined;
}
