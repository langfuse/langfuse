/**
 * Flag-gated, capture-only memory watchdog for the web container.
 *
 * Motivation: web containers show sub-second RSS spikes that stall the main
 * event loop, so every in-process observer that lives on the main event loop
 * (dd-trace runtimeMetrics, signal handlers) goes dark exactly during the
 * episode. A `worker_threads` sampler has its own event loop, and
 * `process.memoryUsage.rss()` is process-wide, so it keeps sampling through a
 * main-thread stall.
 *
 * Two-sided design (V8 isolates are per-thread, so the worker cannot read the
 * main thread's heap stats):
 * - Main thread: an unref()'d ~1s interval publishes heapUsed/heapTotal/
 *   external/arrayBuffers plus a publishedAt timestamp into a
 *   SharedArrayBuffer.
 * - Worker thread: samples process-wide RSS every
 *   LANGFUSE_MEMORY_WATCHDOG_SAMPLE_MS into a ring buffer covering the
 *   trailing 60s, evaluates trigger conditions each sample, and on trigger
 *   writes ONE single-line JSON dump to stdout (container stdout reaches the
 *   log pipeline).
 *
 * Capture-only: the watchdog never exits, aborts, or signals the process. Any
 * internal error is logged once and disables the watchdog.
 *
 * The worker is created via `new Worker(code, { eval: true })` because a
 * separate worker file would not survive the Next.js standalone build. The
 * trigger evaluation is a self-contained pure function
 * (evaluateMemoryWatchdogTick) that is embedded into the worker source via
 * Function.prototype.toString(), so the exact same logic is unit-testable on
 * the main thread. It must stay free of references to module-scope symbols,
 * and free of backticks / `${` so it survives the template-literal embedding.
 */
import { Worker } from "node:worker_threads";

import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

export interface MemoryWatchdogRssSample {
  /** Sample timestamp (epoch ms). */
  t: number;
  /** Process-wide RSS in bytes. */
  rss: number;
}

/** Main-thread heap stats as read from the SharedArrayBuffer. */
export interface MemoryWatchdogHeapStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  /** Epoch ms of the last main-thread publish. */
  publishedAt: number;
}

export interface MemoryWatchdogConfig {
  sampleMs: number;
  /** Ring buffer retention window in ms. */
  ringWindowMs: number;
  /** Trailing window for the growth trigger in ms. */
  growthWindowMs: number;
  growthTriggerBytes: number;
  /** Absolute RSS trigger in bytes; 0 disables the absolute trigger. */
  rssTriggerBytes: number;
  cooldownMs: number;
  /** Heap-publish staleness above which the main event loop counts as stalled. */
  stalenessThresholdMs: number;
  /** Max number of points in the downsampled rss curve of a dump. */
  maxCurvePoints: number;
}

export interface MemoryWatchdogProcessInfo {
  pid: number;
  uptimeS: number;
}

export interface MemoryWatchdogDump {
  msg: "MEMORY_WATCHDOG_TRIGGER";
  reason: "growth" | "absolute";
  rssBytes: number;
  /** rss now minus min(rss) over the trailing growth window. */
  growthBytes: number;
  growthWindowMs: number;
  growthTriggerBytes: number;
  rssTriggerBytes: number | null;
  rssCurve: MemoryWatchdogRssSample[];
  heap: MemoryWatchdogHeapStats | null;
  heapStalenessMs: number | null;
  /** rss - heapTotal - external at last publish; null before first publish. */
  offHeapEstimateBytes: number | null;
  mainEventLoopStalled: boolean;
  pid: number;
  uptimeS: number;
}

export interface MemoryWatchdogTriggerResult {
  reason: "growth" | "absolute";
  payload: MemoryWatchdogDump;
}

/**
 * Pure trigger evaluation: ring buffer + thresholds + now -> trigger decision
 * and dump payload. Runs inside the watchdog worker (embedded via toString(),
 * see module doc) and in unit tests.
 *
 * @param samples ascending by t; last entry is the current sample
 * @param lastTriggerAt epoch ms of the previous trigger; 0 = never
 */
export function evaluateMemoryWatchdogTick(
  samples: ReadonlyArray<MemoryWatchdogRssSample>,
  heap: MemoryWatchdogHeapStats | null,
  lastTriggerAt: number,
  now: number,
  processInfo: MemoryWatchdogProcessInfo,
  config: MemoryWatchdogConfig,
): MemoryWatchdogTriggerResult | null {
  if (samples.length === 0) return null;
  if (lastTriggerAt > 0 && now - lastTriggerAt < config.cooldownMs) return null;

  const current = samples[samples.length - 1];
  const growthWindowStart = now - config.growthWindowMs;
  let windowMin = current.rss;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (sample.t >= growthWindowStart && sample.rss < windowMin) {
      windowMin = sample.rss;
    }
  }
  const growthBytes = current.rss - windowMin;

  let reason: "growth" | "absolute" | null = null;
  if (growthBytes > config.growthTriggerBytes) {
    reason = "growth";
  } else if (
    config.rssTriggerBytes > 0 &&
    current.rss > config.rssTriggerBytes
  ) {
    reason = "absolute";
  }
  if (reason === null) return null;

  const stride = Math.max(1, Math.ceil(samples.length / config.maxCurvePoints));
  const curve: MemoryWatchdogRssSample[] = [];
  for (let i = samples.length - 1; i >= 0; i -= stride) {
    curve.push({ t: samples[i].t, rss: samples[i].rss });
  }
  curve.reverse();

  const heapStalenessMs =
    heap === null ? null : Math.max(0, now - heap.publishedAt);
  const payload: MemoryWatchdogDump = {
    msg: "MEMORY_WATCHDOG_TRIGGER",
    reason: reason,
    rssBytes: current.rss,
    growthBytes: growthBytes,
    growthWindowMs: config.growthWindowMs,
    growthTriggerBytes: config.growthTriggerBytes,
    rssTriggerBytes: config.rssTriggerBytes > 0 ? config.rssTriggerBytes : null,
    rssCurve: curve,
    heap: heap,
    heapStalenessMs: heapStalenessMs,
    offHeapEstimateBytes:
      heap === null ? null : current.rss - heap.heapTotal - heap.external,
    mainEventLoopStalled:
      heapStalenessMs === null || heapStalenessMs > config.stalenessThresholdMs,
    pid: processInfo.pid,
    uptimeS: processInfo.uptimeS,
  };
  return { reason: reason, payload: payload };
}

// SharedArrayBuffer layout (Float64Array indices). publishedAt is written
// last by the publisher so a non-zero value marks a complete record.
const HEAP_FIELD_COUNT = 5; // 0 heapUsed, 1 heapTotal, 2 external, 3 arrayBuffers, 4 publishedAt

/** Exported for the unit-test smoke test; not part of the public surface. */
export function buildWorkerSource(): string {
  return `
"use strict";
const workerThreads = require("node:worker_threads");
const cfg = workerThreads.workerData.config;
const heapView = new Float64Array(workerThreads.workerData.heapBuffer);
const evaluateTick = ${evaluateMemoryWatchdogTick.toString()};
const samples = [];
let lastTriggerAt = 0;
const timer = setInterval(function () {
  try {
    const now = Date.now();
    samples.push({ t: now, rss: process.memoryUsage.rss() });
    const cutoff = now - cfg.ringWindowMs;
    while (samples.length > 0 && samples[0].t < cutoff) samples.shift();
    const publishedAt = heapView[4];
    const heap =
      publishedAt > 0
        ? {
            heapUsed: heapView[0],
            heapTotal: heapView[1],
            external: heapView[2],
            arrayBuffers: heapView[3],
            publishedAt: publishedAt,
          }
        : null;
    const result = evaluateTick(
      samples,
      heap,
      lastTriggerAt,
      now,
      { pid: process.pid, uptimeS: process.uptime() },
      cfg,
    );
    if (result !== null) {
      lastTriggerAt = now;
      console.log(JSON.stringify(result.payload));
    }
  } catch (err) {
    clearInterval(timer);
    console.error(
      JSON.stringify({
        msg: "MEMORY_WATCHDOG_ERROR",
        error: String(err instanceof Error ? err.message : err),
      }),
    );
  }
}, cfg.sampleMs);
`;
}

let state: "idle" | "started" | "disabled" = "idle";

/**
 * Starts the watchdog if LANGFUSE_WEB_MEMORY_WATCHDOG=true. Default off:
 * no worker thread, no intervals, no output. Never throws.
 */
export function startMemoryWatchdog(): void {
  if (state !== "idle") return;
  if (env.LANGFUSE_WEB_MEMORY_WATCHDOG !== "true") return;
  state = "started";

  let heapInterval: NodeJS.Timeout | undefined;
  let worker: Worker | undefined;
  const disable = (reason: string, error?: unknown) => {
    if (state === "disabled") return;
    state = "disabled";
    try {
      logger.error(`Memory watchdog disabled: ${reason}`, { error });
      if (heapInterval !== undefined) clearInterval(heapInterval);
      if (worker !== undefined) worker.terminate().catch(() => undefined);
    } catch {
      // capture-only: never let the watchdog degrade the server
    }
  };

  try {
    const config: MemoryWatchdogConfig = {
      sampleMs: env.LANGFUSE_MEMORY_WATCHDOG_SAMPLE_MS,
      ringWindowMs: 60_000,
      growthWindowMs: 10_000,
      growthTriggerBytes:
        env.LANGFUSE_MEMORY_WATCHDOG_GROWTH_TRIGGER_MB * 1024 * 1024,
      rssTriggerBytes:
        (env.LANGFUSE_MEMORY_WATCHDOG_RSS_TRIGGER_MB ?? 0) * 1024 * 1024,
      cooldownMs: env.LANGFUSE_MEMORY_WATCHDOG_COOLDOWN_S * 1000,
      stalenessThresholdMs: 2_500,
      maxCurvePoints: 30,
    };

    const heapBuffer = new SharedArrayBuffer(
      HEAP_FIELD_COUNT * Float64Array.BYTES_PER_ELEMENT,
    );
    const heapView = new Float64Array(heapBuffer);
    const publishHeapStats = () => {
      try {
        const usage = process.memoryUsage();
        heapView[0] = usage.heapUsed;
        heapView[1] = usage.heapTotal;
        heapView[2] = usage.external;
        heapView[3] = usage.arrayBuffers;
        heapView[4] = Date.now();
      } catch (error) {
        disable("heap publisher failed", error);
      }
    };
    publishHeapStats();
    heapInterval = setInterval(publishHeapStats, 1_000);
    heapInterval.unref();

    worker = new Worker(buildWorkerSource(), {
      eval: true,
      workerData: { config, heapBuffer },
    });
    worker.unref();
    worker.on("error", (error) => disable("worker error", error));

    logger.info("Memory watchdog started (capture-only)", {
      sampleMs: config.sampleMs,
      growthTriggerBytes: config.growthTriggerBytes,
      rssTriggerBytes: config.rssTriggerBytes,
      cooldownMs: config.cooldownMs,
    });
  } catch (error) {
    disable("failed to start", error);
  }
}
