import { Worker } from "node:worker_threads";

import { describe, expect, it } from "vitest";

import {
  buildWorkerSource,
  evaluateMemoryWatchdogTick,
  type MemoryWatchdogConfig,
  type MemoryWatchdogHeapStats,
  type MemoryWatchdogRssSample,
} from "@/src/server/memoryWatchdog";

const NOW = 1_000_000_000;

const config: MemoryWatchdogConfig = {
  sampleMs: 100,
  ringWindowMs: 60_000,
  growthWindowMs: 10_000,
  growthTriggerBytes: 1_000,
  rssTriggerBytes: 0,
  cooldownMs: 60_000,
  stalenessThresholdMs: 2_500,
  maxCurvePoints: 30,
};

const processInfo = { pid: 123, uptimeS: 42 };

const freshHeap: MemoryWatchdogHeapStats = {
  heapUsed: 100,
  heapTotal: 200,
  external: 50,
  arrayBuffers: 10,
  publishedAt: NOW - 500,
};

/** Linear ramp of `count` samples ending at t=NOW. */
const ramp = (
  count: number,
  stepMs: number,
  rssStart: number,
  rssEnd: number,
): MemoryWatchdogRssSample[] =>
  Array.from({ length: count }, (_, i) => ({
    t: NOW - (count - 1 - i) * stepMs,
    rss: rssStart + ((rssEnd - rssStart) * i) / (count - 1),
  }));

const flat = (count: number, stepMs: number, rss: number) =>
  ramp(count, stepMs, rss, rss);

describe("evaluateMemoryWatchdogTick", () => {
  it("fires the growth trigger when rss grows beyond the threshold within the window", () => {
    const samples = ramp(101, 100, 500, 2_000); // 10s window, +1500 bytes
    const result = evaluateMemoryWatchdogTick(
      samples,
      freshHeap,
      0,
      NOW,
      processInfo,
      config,
    );
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("growth");
    expect(result!.payload.msg).toBe("MEMORY_WATCHDOG_TRIGGER");
    expect(result!.payload.growthBytes).toBe(1_500);
    expect(result!.payload.rssBytes).toBe(2_000);
    expect(result!.payload.growthTriggerBytes).toBe(1_000);
    expect(result!.payload.rssTriggerBytes).toBeNull(); // absolute trigger unset
    expect(result!.payload.pid).toBe(123);
    expect(result!.payload.uptimeS).toBe(42);
  });

  it("does not fire on flat rss", () => {
    const samples = flat(101, 100, 5_000_000);
    expect(
      evaluateMemoryWatchdogTick(
        samples,
        freshHeap,
        0,
        NOW,
        processInfo,
        config,
      ),
    ).toBeNull();
  });

  it("ignores samples older than the growth window when computing growth", () => {
    // Deep minimum 15s ago; within the trailing 10s rss is flat.
    const samples = [{ t: NOW - 15_000, rss: 100 }, ...flat(101, 100, 5_000)];
    expect(
      evaluateMemoryWatchdogTick(
        samples,
        freshHeap,
        0,
        NOW,
        processInfo,
        config,
      ),
    ).toBeNull();
  });

  it("fires the absolute trigger when rss exceeds the configured limit", () => {
    const absoluteConfig = { ...config, rssTriggerBytes: 4_000 };
    const samples = flat(101, 100, 5_000);
    const result = evaluateMemoryWatchdogTick(
      samples,
      freshHeap,
      0,
      NOW,
      processInfo,
      absoluteConfig,
    );
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("absolute");
    expect(result!.payload.rssTriggerBytes).toBe(4_000);
    expect(result!.payload.rssBytes).toBe(5_000);
  });

  it("suppresses triggers during the cooldown and fires again after it", () => {
    const samples = ramp(101, 100, 500, 2_000);
    expect(
      evaluateMemoryWatchdogTick(
        samples,
        freshHeap,
        NOW - 30_000, // 30s ago < 60s cooldown
        NOW,
        processInfo,
        config,
      ),
    ).toBeNull();
    expect(
      evaluateMemoryWatchdogTick(
        samples,
        freshHeap,
        NOW - 61_000,
        NOW,
        processInfo,
        config,
      ),
    ).not.toBeNull();
  });

  it("computes heap staleness and the main-event-loop-stalled flag", () => {
    const samples = ramp(101, 100, 500, 2_000);
    const fresh = evaluateMemoryWatchdogTick(
      samples,
      freshHeap,
      0,
      NOW,
      processInfo,
      config,
    );
    expect(fresh!.payload.heapStalenessMs).toBe(500);
    expect(fresh!.payload.mainEventLoopStalled).toBe(false);
    expect(fresh!.payload.offHeapEstimateBytes).toBe(2_000 - 200 - 50);
    expect(fresh!.payload.heap).toEqual(freshHeap);

    const staleHeap = { ...freshHeap, publishedAt: NOW - 5_000 };
    const stale = evaluateMemoryWatchdogTick(
      samples,
      staleHeap,
      0,
      NOW,
      processInfo,
      config,
    );
    expect(stale!.payload.heapStalenessMs).toBe(5_000);
    expect(stale!.payload.mainEventLoopStalled).toBe(true);
  });

  it("treats a never-published heap as stalled with null-safe derived fields", () => {
    const samples = ramp(101, 100, 500, 2_000);
    const result = evaluateMemoryWatchdogTick(
      samples,
      null,
      0,
      NOW,
      processInfo,
      config,
    );
    expect(result!.payload.heap).toBeNull();
    expect(result!.payload.heapStalenessMs).toBeNull();
    expect(result!.payload.offHeapEstimateBytes).toBeNull();
    expect(result!.payload.mainEventLoopStalled).toBe(true);
  });

  it("downsamples the rss curve to at most maxCurvePoints ending at the current sample", () => {
    const samples = ramp(600, 100, 500, 600_000); // full 60s ring
    const result = evaluateMemoryWatchdogTick(
      samples,
      freshHeap,
      0,
      NOW,
      processInfo,
      config,
    );
    const curve = result!.payload.rssCurve;
    expect(curve.length).toBeLessThanOrEqual(30);
    expect(curve.length).toBeGreaterThan(20);
    expect(curve[curve.length - 1]).toEqual(samples[samples.length - 1]);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].t).toBeGreaterThan(curve[i - 1].t);
    }
    // Single-line JSON dump stays far below the 256 KB log-pipeline limit.
    expect(JSON.stringify(result!.payload).length).toBeLessThan(10_000);
  });

  it("survives Function.prototype.toString() embedding (worker eval path)", () => {
    const rebuilt = new Function(
      "return (" + evaluateMemoryWatchdogTick.toString() + ")",
    )() as typeof evaluateMemoryWatchdogTick;
    const samples = ramp(101, 100, 500, 2_000);
    const result = rebuilt(samples, freshHeap, 0, NOW, processInfo, config);
    expect(result).toEqual(
      evaluateMemoryWatchdogTick(
        samples,
        freshHeap,
        0,
        NOW,
        processInfo,
        config,
      ),
    );
    expect(result!.reason).toBe("growth");
  });
});

describe("memory watchdog worker smoke test", () => {
  it("boots the eval worker and emits a trigger dump to stdout", async () => {
    const heapBuffer = new SharedArrayBuffer(
      5 * Float64Array.BYTES_PER_ELEMENT,
    );
    const heapView = new Float64Array(heapBuffer);
    heapView[0] = 100;
    heapView[1] = 200;
    heapView[2] = 50;
    heapView[3] = 10;
    heapView[4] = Date.now();

    // rssTriggerBytes=1 makes the very first real rss sample trigger; no
    // real allocation needed.
    const workerConfig: MemoryWatchdogConfig = {
      ...config,
      sampleMs: 5,
      growthTriggerBytes: Number.MAX_SAFE_INTEGER,
      rssTriggerBytes: 1,
    };
    const worker = new Worker(buildWorkerSource(), {
      eval: true,
      stdout: true,
      workerData: { config: workerConfig, heapBuffer },
    });
    try {
      const line = await new Promise<string>((resolve, reject) => {
        let buffer = "";
        const timeout = setTimeout(
          () => reject(new Error("no watchdog dump within 5s")),
          5_000,
        );
        worker.stdout.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf8");
          const newlineIndex = buffer.indexOf("\n");
          if (newlineIndex >= 0) {
            clearTimeout(timeout);
            resolve(buffer.slice(0, newlineIndex));
          }
        });
        worker.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      const dump = JSON.parse(line);
      expect(dump.msg).toBe("MEMORY_WATCHDOG_TRIGGER");
      expect(dump.reason).toBe("absolute");
      expect(dump.rssBytes).toBeGreaterThan(1);
      expect(dump.pid).toBe(process.pid);
      expect(dump.mainEventLoopStalled).toBe(false);
      expect(dump.heap.heapTotal).toBe(200);
    } finally {
      await worker.terminate();
    }
  });
});
