import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";

const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
eventLoopDelay.enable();
const eventLoopStart = performance.eventLoopUtilization();

export const metrics = {
  requests: {
    total: 0,
    active: 0,
    completed: 0,
    failed: 0,
    native: 0,
    translate: 0,
    requestBytes: 0,
    responseBytes: 0,
    durationMsSum: 0,
    durationMsMax: 0,
  },
  telemetry: {
    mode: "inline",
    pending: 0,
    pendingBytes: 0,
    peakPendingBytes: 0,
    dropped: 0,
    published: 0,
    failed: 0,
    batchesPublished: 0,
    batchesFailed: 0,
  },
};

function finiteMilliseconds(nanoseconds) {
  const milliseconds = nanoseconds / 1e6;
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

export function metricsSnapshot() {
  const memory = process.memoryUsage();
  const utilization = performance.eventLoopUtilization(eventLoopStart);

  return {
    runtime: "node",
    versions: {
      node: process.versions.node,
      v8: process.versions.v8,
    },
    uptimeSeconds: process.uptime(),
    requests: { ...metrics.requests },
    telemetry: { ...metrics.telemetry },
    process: {
      rssBytes: memory.rss,
      peakRssBytes: peakRssBytes(),
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
    },
    eventLoop: {
      delayP99Ms: finiteMilliseconds(eventLoopDelay.percentile(99)),
      delayMeanMs: finiteMilliseconds(eventLoopDelay.mean),
      delayMaxMs: finiteMilliseconds(eventLoopDelay.max),
      utilization: utilization.utilization,
    },
  };
}

function peakRssBytes() {
  try {
    const match = /^VmHWM:\s+(\d+)\s+kB$/m.exec(
      readFileSync("/proc/self/status", "utf8"),
    );
    return match ? Number(match[1]) * 1024 : 0;
  } catch {
    return 0;
  }
}

export function finishRequest({ durationMs, failed, responseBytes }) {
  metrics.requests.active -= 1;
  metrics.requests.responseBytes += responseBytes;
  metrics.requests.durationMsSum += durationMs;
  metrics.requests.durationMsMax = Math.max(
    metrics.requests.durationMsMax,
    durationMs,
  );
  if (failed) metrics.requests.failed += 1;
  else metrics.requests.completed += 1;
}
