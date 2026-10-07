import { existsSync } from "node:fs";
import path from "node:path";

import { logger } from "@langfuse/shared/src/server";
import PQueue from "p-queue";
import Piscina from "piscina";

import type {
  OtelIngestionWorkerRequest,
  OtelIngestionWorkerResult,
} from "./otelIngestionWorker";

const MAX_WORKER_QUEUE_DEPTH = 2;

type OtelIngestionWorkerRuntime = {
  pool?: Piscina<OtelIngestionWorkerRequest, OtelIngestionWorkerResult>;
  preloadPromise?: Promise<void>;
  queue: PQueue;
};

// Next emits instrumentation and API routes as separate server bundles. Keep
// their worker pool and admission queue shared within the Node process.
const workerRuntimeKey = Symbol.for("langfuse.otelIngestionWorker.runtime");
const workerRuntimeGlobal = globalThis as typeof globalThis &
  Record<symbol, OtelIngestionWorkerRuntime | undefined>;

function getWorkerRuntime(): OtelIngestionWorkerRuntime {
  let runtime = workerRuntimeGlobal[workerRuntimeKey];
  if (!runtime) {
    runtime = { queue: new PQueue({ concurrency: 1 }) };
    workerRuntimeGlobal[workerRuntimeKey] = runtime;
  }
  return runtime;
}

function getWorkerFilename(): string {
  const distDir = process.env.NEXT_DIST_DIR || ".next";
  const serverEntry = process.argv[1];
  const candidates = [
    ...(serverEntry
      ? [
          path.join(
            path.dirname(path.resolve(serverEntry)),
            "otelIngestionWorker.js",
          ),
        ]
      : []),
    path.join(process.cwd(), "web", "otelIngestionWorker.js"),
    path.join(
      process.cwd(),
      distDir,
      "standalone",
      "web",
      "otelIngestionWorker.js",
    ),
  ];
  const filename = candidates.find((candidate) => existsSync(candidate));

  if (!filename) {
    throw new Error(
      "OTel ingestion worker artifact is missing; run the web build before enabling worker ingestion",
    );
  }

  return filename;
}

function getWorkerPool(): Piscina<
  OtelIngestionWorkerRequest,
  OtelIngestionWorkerResult
> {
  const runtime = getWorkerRuntime();
  if (!runtime.pool) {
    runtime.pool = new Piscina({
      filename: getWorkerFilename(),
      minThreads: 1,
      maxThreads: 1,
      maxQueue: 0,
      atomics: "disabled",
    });
    runtime.pool.on("error", (error) => {
      logger.error("OTel ingestion worker pool error", error);
    });
  }

  return runtime.pool;
}

export function dispatchOtelIngestionWorkerTask(
  request: OtelIngestionWorkerRequest,
  options?: Parameters<
    Piscina<OtelIngestionWorkerRequest, OtelIngestionWorkerResult>["run"]
  >[1],
): Promise<OtelIngestionWorkerResult> {
  return getWorkerPool().run(request, options);
}

/**
 * Owns admission for both shadow and real worker ingestion. The task must cover
 * the complete request lifecycle so a waiting request stays paused and unread.
 */
export function tryScheduleOtelIngestionWorkerLifecycle(
  task: (signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> | undefined {
  const { queue } = getWorkerRuntime();
  if (queue.pending + queue.size >= MAX_WORKER_QUEUE_DEPTH) {
    return undefined;
  }

  return queue.add(
    async ({ signal: queueSignal }) => task(queueSignal),
    signal ? { signal } : undefined,
  );
}

async function runWorkerPreload(): Promise<void> {
  const result = await dispatchOtelIngestionWorkerTask({ type: "warmup" });
  if (result.kind !== "warmup") {
    throw new Error(
      "OTel ingestion worker did not report ready during warm-up",
    );
  }
}

export function preloadOtelIngestionWorker(): Promise<void> {
  const runtime = getWorkerRuntime();
  if (!runtime.preloadPromise) {
    runtime.preloadPromise = runWorkerPreload();
  }
  return runtime.preloadPromise;
}
