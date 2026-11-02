import {
  logger,
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
import type { NextApiResponse } from "next";

import {
  dispatchOtelIngestionWorkerTask,
  preloadOtelIngestionWorker,
  tryScheduleOtelIngestionWorkerLifecycle,
} from "./otelIngestionWorkerPool";

let lastProcessingDurationMs: number | undefined;
let workerPreloadPromise: Promise<void> | undefined;

type WorkerShadowStart = (res: NextApiResponse, projectId: string) => void;
const workerShadowStartKey = Symbol.for(
  "langfuse.otelIngestionWorkerShadow.start",
);
const workerShadowGlobal = globalThis as typeof globalThis &
  Record<symbol, WorkerShadowStart | undefined>;

function scheduleAdmissionShadow(projectId: string, durationMs: number): void {
  const task = tryScheduleOtelIngestionWorkerLifecycle(async (signal) => {
    const result = await dispatchOtelIngestionWorkerTask(
      { type: "shadow", durationMs },
      { signal },
    );
    if (result.kind !== "shadow") {
      throw new Error(
        "OTel ingestion worker returned an invalid shadow result",
      );
    }
  });

  if (!task) {
    recordIncrement("langfuse.ingestion.otel.worker_shadow.admission", 1, {
      outcome: "would_reject",
    });
    logger.warn("OTel ingestion worker shadow would reject request", {
      projectId,
      simulatedProcessingDurationMs: durationMs,
    });
    return;
  }

  recordIncrement("langfuse.ingestion.otel.worker_shadow.admission", 1, {
    outcome: "admitted",
  });
  task.catch((error: unknown) => {
    logger.error("OTel ingestion worker shadow task failed", error);
  });
}

function runOtelIngestionWorkerAdmissionShadow(
  res: NextApiResponse,
  projectId: string,
): void {
  if (lastProcessingDurationMs !== undefined) {
    scheduleAdmissionShadow(projectId, lastProcessingDurationMs);
  }

  const startedAt = performance.now();
  let completed = false;
  function stopTracking() {
    res.off("finish", recordProcessingDuration);
    res.off("close", stopTracking);
  }
  function recordProcessingDuration() {
    if (completed) return;
    completed = true;
    stopTracking();
    const processingDurationMs = Math.max(
      1,
      Math.round(performance.now() - startedAt),
    );
    lastProcessingDurationMs = processingDurationMs;
    recordDistribution(
      "langfuse.ingestion.otel.worker_shadow.real_processing_duration_ms",
      processingDurationMs,
    );
  }

  res.once("finish", recordProcessingDuration);
  // A client disconnect does not mean inline processing has completed.
  res.once("close", stopTracking);
}

export function startOtelIngestionWorkerAdmissionShadow(
  res: NextApiResponse,
  projectId: string,
): void {
  workerShadowGlobal[workerShadowStartKey]?.(res, projectId);
}

async function runWorkerPreload(): Promise<void> {
  await preloadOtelIngestionWorker();
  workerShadowGlobal[workerShadowStartKey] =
    runOtelIngestionWorkerAdmissionShadow;
  logger.info("OTel ingestion worker shadow preloaded");
}

export function preloadOtelIngestionWorkerShadow(): Promise<void> {
  if (!workerPreloadPromise) {
    workerPreloadPromise = runWorkerPreload();
  }
  return workerPreloadPromise;
}
