import { existsSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";

import PQueue from "p-queue";
import Piscina from "piscina";
import { getCurrentSpan, logger } from "@langfuse/shared/src/server";
import type { NextApiResponse } from "next";

import type {
  OtelIngestionRequest,
  OtelIngestionResult,
} from "./processOtelIngestion";
import { readOtelRequestBody } from "./otelRequestBody";
import type {
  OtelIngestionWorkerRequest,
  OtelIngestionWorkerResult,
} from "./otelIngestionWorker";

let workerPool:
  | Piscina<OtelIngestionWorkerRequest, OtelIngestionWorkerResult>
  | undefined;
let workerCompletionLogged = false;
let workerPreloadPromise: Promise<void> | undefined;
const workerQueue = new PQueue({ concurrency: 1 });
const MAX_WORKER_QUEUE_DEPTH = 2;
const OTEL_REQUEST_BODY_READ_TIMEOUT_MS = 300_000;

function getWorkerFilename(): string {
  const distDir = process.env.NEXT_DIST_DIR || ".next";
  const serverEntry = process.argv[1];
  const workerPaths = [
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
  const workerFilename = workerPaths.find((candidate) => existsSync(candidate));

  if (!workerFilename) {
    throw new Error(
      "OTel ingestion worker artifact is missing; run the web build before enabling worker ingestion",
    );
  }

  return workerFilename;
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
  }

  return workerPool;
}

export type OtelIngestionWorkerContext = {
  body: Buffer;
  process: (
    request: OtelIngestionRequest,
  ) => Promise<OtelIngestionResult | undefined>;
};

export type OtelIngestionWorkerContextResult =
  | OtelIngestionWorkerContext
  | { response: unknown };

/**
 * One queue task owns admission, body reading, and worker execution through
 * response completion. Separate abort signals remove queued waiters without
 * releasing an active slot before Piscina settles.
 */
export async function createOtelIngestionWorkerContext(
  req: IncomingMessage,
  res: NextApiResponse,
  projectId: string,
  maxBodyBytes: number,
): Promise<OtelIngestionWorkerContextResult> {
  req.pause();
  const requestAbortController = new AbortController();
  const queueAbortController = new AbortController();
  let queueTaskStarted = false;
  const { promise: lifecycle, resolve: resolveLifecycle } =
    Promise.withResolvers<void>();
  const {
    promise: contextResult,
    resolve: resolveContext,
    reject: rejectContext,
  } = Promise.withResolvers<OtelIngestionWorkerContextResult>();

  function cleanup() {
    req.off("aborted", onRequestAborted);
    req.off("close", onRequestClose);
    res.off("finish", cleanup);
    res.off("close", onResponseClose);
    resolveLifecycle();
  }
  function onRequestAborted() {
    requestAbortController.abort();
    if (!queueTaskStarted) queueAbortController.abort();
  }
  function onRequestClose() {
    if (!req.complete) onRequestAborted();
  }
  function onResponseClose() {
    requestAbortController.abort();
    if (!queueTaskStarted) queueAbortController.abort();
    cleanup();
  }

  req.once("aborted", onRequestAborted);
  req.once("close", onRequestClose);

  if (requestAbortController.signal.aborted) {
    cleanup();
    return { response: {} };
  }

  if (workerQueue.pending + workerQueue.size >= MAX_WORKER_QUEUE_DEPTH) {
    cleanup();
    res.setHeader("Retry-After", 1);
    res.setHeader("Connection", "close");
    res.status(503);
    return { response: { error: "OTel ingestion worker is busy" } };
  }

  res.once("close", onResponseClose);
  const workerTask = workerQueue.add(
    async ({ signal }) => {
      queueTaskStarted = true;
      if (signal?.aborted || requestAbortController.signal.aborted) {
        cleanup();
        resolveContext({ response: {} });
        return;
      }

      res.once("finish", cleanup);

      let processPromise: Promise<OtelIngestionResult | undefined> =
        Promise.resolve(undefined);
      try {
        const bodyReadAbortController = new AbortController();
        const bodyReadTimeout = setTimeout(
          () => bodyReadAbortController.abort(),
          OTEL_REQUEST_BODY_READ_TIMEOUT_MS,
        );

        let body: Buffer;
        try {
          const bodyPromise = readOtelRequestBody(
            req,
            maxBodyBytes,
            AbortSignal.any([
              requestAbortController.signal,
              bodyReadAbortController.signal,
            ]),
          );
          req.resume();
          body = await bodyPromise;
        } catch (error) {
          if (requestAbortController.signal.aborted) {
            cleanup();
            resolveContext({ response: {} });
          } else if (bodyReadAbortController.signal.aborted) {
            logger.warn("OTel request body read timed out", {
              projectId,
              timeoutMs: OTEL_REQUEST_BODY_READ_TIMEOUT_MS,
            });
            res.status(408);
            resolveContext({
              response: { error: "Request body read timed out" },
            });
          } else {
            rejectContext(error);
          }
          await lifecycle;
          return;
        } finally {
          clearTimeout(bodyReadTimeout);
        }

        if (requestAbortController.signal.aborted) {
          cleanup();
          resolveContext({ response: {} });
          await lifecycle;
          return;
        }

        resolveContext({
          body,
          process(request) {
            if (request.config.ingestionVersion) {
              getCurrentSpan()?.setAttribute(
                "langfuse.ingestion.version",
                request.config.ingestionVersion,
              );
            }

            processPromise = runOtelIngestionWorker(
              request,
              requestAbortController.signal,
            ).catch((error) => {
              if (requestAbortController.signal.aborted) {
                cleanup();
                return undefined;
              }
              throw error;
            });
            return processPromise;
          },
        });
        await lifecycle;
        await processPromise.catch(() => undefined);
      } catch (error) {
        rejectContext(error);
        await lifecycle;
      }
    },
    { signal: queueAbortController.signal },
  );

  workerTask.catch((error: unknown) => {
    if (queueAbortController.signal.aborted) {
      cleanup();
      resolveContext({ response: {} });
      return;
    }

    cleanup();
    rejectContext(error);
  });

  return contextResult;
}

export function getTransferableOtelBody(body: Buffer): Buffer<ArrayBuffer> {
  if (
    body.buffer instanceof ArrayBuffer &&
    body.byteOffset === 0 &&
    body.byteLength === body.buffer.byteLength
  ) {
    return body as Buffer<ArrayBuffer>;
  }

  const transferableBody = Buffer.allocUnsafeSlow(body.byteLength);
  body.copy(transferableBody);
  return transferableBody;
}

async function runOtelIngestionWorker(
  request: OtelIngestionRequest,
  signal: AbortSignal,
): Promise<OtelIngestionResult> {
  const decodedBodyBytes = request.body.byteLength;
  const body = getTransferableOtelBody(request.body);
  const workerRequest: OtelIngestionWorkerRequest = {
    ...request,
    body,
  };

  const pool = getWorkerPool();
  const span = getCurrentSpan();
  span?.setAttribute("langfuse.ingestion.otel.worker_used", true);
  const startedAt = performance.now();

  try {
    const result = await pool.run(workerRequest, {
      transferList: [body.buffer],
      signal,
    });
    if (result.kind === "warmup") {
      throw new Error("OTel ingestion worker returned a warm-up result");
    }
    const durationMs = Math.round(performance.now() - startedAt);

    if (!workerCompletionLogged) {
      workerCompletionLogged = true;
      logger.info("OTel ingestion worker completed first task", {
        projectId: request.config.projectId,
        encodedBodyBytes: request.encodedBodyBytes,
        decodedBodyBytes,
        durationMs,
        resultKind: result.kind,
        ...(result.kind === "http" ? { resultStatus: result.status } : {}),
      });
    }

    return result;
  } finally {
    span?.setAttribute(
      "langfuse.ingestion.otel.worker_duration_ms",
      Math.round(performance.now() - startedAt),
    );
  }
}

const OTEL_INGESTION_WORKER_WARMUP_REQUEST = { type: "warmup" } as const;

async function runOtelIngestionWorkerPreload(): Promise<void> {
  const result = await getWorkerPool().run(
    OTEL_INGESTION_WORKER_WARMUP_REQUEST,
  );
  if (result.kind !== "warmup") {
    throw new Error(
      "OTel ingestion worker did not report ready during warm-up",
    );
  }
}

export function preloadOtelIngestionWorker(): Promise<void> {
  workerPreloadPromise ??= runOtelIngestionWorkerPreload();
  return workerPreloadPromise;
}
