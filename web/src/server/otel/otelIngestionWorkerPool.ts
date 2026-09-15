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

let workerPool:
  | Piscina<OtelIngestionWorkerRequest, OtelIngestionWorkerResult>
  | undefined;
let workerPreloadPromise: Promise<void> | undefined;
const workerQueue = new PQueue({ concurrency: 1 });

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
  if (!workerPool) {
    workerPool = new Piscina({
      filename: getWorkerFilename(),
      minThreads: 1,
      maxThreads: 1,
      maxQueue: 0,
      atomics: "disabled",
    });
    workerPool.on("error", (error) => {
      logger.error("OTel ingestion worker pool error", error);
    });
  }

  return workerPool;
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
  if (workerQueue.pending + workerQueue.size >= MAX_WORKER_QUEUE_DEPTH) {
    return undefined;
  }

  return workerQueue.add(
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
  workerPreloadPromise ??= runWorkerPreload();
  return workerPreloadPromise;
}
