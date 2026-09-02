import { existsSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";

import Piscina from "piscina";
import { getCurrentSpan, logger } from "@langfuse/shared/src/server";
import type { NextApiResponse } from "next";

import type {
  OtelIngestionRequest,
  OtelIngestionResult,
} from "./processOtelIngestion";
import { readOtelRequestBody } from "./otelRequestBody";
import type { OtelIngestionWorkerRequest } from "./otelIngestionWorker";

let workerPool:
  | Piscina<OtelIngestionWorkerRequest, OtelIngestionResult>
  | undefined;
let workerCompletionLogged = false;
let workerActive = false;

type OtelIngestionWorkerAdmission =
  | { kind: "acquired"; release: () => void }
  | { kind: "busy" }
  | { kind: "aborted" };

type WorkerWaiter = {
  resolve: (admission: OtelIngestionWorkerAdmission) => void;
  signal: AbortSignal;
  onAbort: () => void;
};

let workerWaiter: WorkerWaiter | undefined;
const OTEL_REQUEST_BODY_READ_TIMEOUT_MS = 300_000;

function getWorkerFilename(): string {
  const distDir = process.env.NEXT_DIST_DIR || ".next";
  const workerPaths = [
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
  OtelIngestionResult
> {
  if (!workerPool) {
    workerPool = new Piscina({
      filename: getWorkerFilename(),
      minThreads: 1,
      maxThreads: 1,
      maxQueue: 1,
      atomics: "disabled",
    });
  }

  return workerPool;
}

function releaseWorkerTurn() {
  const waiter = workerWaiter;
  workerWaiter = undefined;

  if (!waiter) {
    workerActive = false;
    return;
  }

  waiter.signal.removeEventListener("abort", waiter.onAbort);
  if (waiter.signal.aborted) {
    workerActive = false;
    waiter.resolve({ kind: "aborted" });
    return;
  }

  waiter.resolve({
    kind: "acquired",
    release: createWorkerRelease(),
  });
}

function createWorkerRelease(): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseWorkerTurn();
  };
}

/**
 * Serializes requests before their bodies are read so waiting requests remain
 * paused at the socket instead of allocating another large request buffer.
 */
export function acquireOtelIngestionWorker(
  signal: AbortSignal,
): Promise<OtelIngestionWorkerAdmission> {
  if (signal.aborted) {
    return Promise.resolve({ kind: "aborted" });
  }

  if (!workerActive) {
    workerActive = true;
    return Promise.resolve({
      kind: "acquired",
      release: createWorkerRelease(),
    });
  }

  if (workerWaiter) {
    return Promise.resolve({ kind: "busy" });
  }

  return new Promise((resolve) => {
    let waiter: WorkerWaiter;
    const onAbort = () => {
      if (workerWaiter !== waiter) return;
      workerWaiter = undefined;
      signal.removeEventListener("abort", onAbort);
      resolve({ kind: "aborted" });
    };

    waiter = {
      resolve,
      signal,
      onAbort,
    };
    workerWaiter = waiter;
    signal.addEventListener("abort", onAbort, { once: true });

    if (signal.aborted) onAbort();
  });
}

export type OtelIngestionWorkerLease = {
  readBody: (
    maxBodyBytes: number,
  ) => Promise<{ body: Buffer } | { response: unknown }>;
  run: (
    request: OtelIngestionRequest,
  ) => Promise<OtelIngestionResult | undefined>;
};

export type OtelIngestionWorkerLeaseResult =
  | { lease: OtelIngestionWorkerLease }
  | { response: unknown };

export async function createOtelIngestionWorkerLease(
  req: IncomingMessage,
  res: NextApiResponse,
  projectId: string,
): Promise<OtelIngestionWorkerLeaseResult> {
  req.pause();
  const abortController = new AbortController();
  let releaseWorker: (() => void) | undefined;
  let workerStarted = false;

  function cleanup() {
    req.off("aborted", onRequestAborted);
    req.off("close", onRequestClose);
    res.off("finish", cleanup);
    releaseWorker?.();
  }
  function onRequestAborted() {
    abortController.abort();
    if (!workerStarted) cleanup();
  }
  function onRequestClose() {
    if (!req.complete) onRequestAborted();
  }

  req.once("aborted", onRequestAborted);
  req.once("close", onRequestClose);
  const admission = await acquireOtelIngestionWorker(abortController.signal);
  if (admission.kind === "busy") {
    cleanup();
    res.setHeader("Retry-After", 1);
    res.setHeader("Connection", "close");
    res.status(503);
    return { response: { error: "OTel ingestion worker is busy" } };
  }
  if (admission.kind === "aborted") {
    cleanup();
    return { response: {} };
  }
  if (abortController.signal.aborted) {
    admission.release();
    cleanup();
    return { response: {} };
  }
  releaseWorker = admission.release;
  res.once("finish", cleanup);

  return {
    lease: {
      async readBody(maxBodyBytes) {
        const bodyReadAbortController = new AbortController();
        const bodyReadTimeout = setTimeout(
          () => bodyReadAbortController.abort(),
          OTEL_REQUEST_BODY_READ_TIMEOUT_MS,
        );

        try {
          const bodyPromise = readOtelRequestBody(
            req,
            maxBodyBytes,
            bodyReadAbortController.signal,
          );
          req.resume();
          return {
            body: await bodyPromise,
          };
        } catch (error) {
          if (bodyReadAbortController.signal.aborted) {
            logger.warn("OTel request body read timed out", {
              projectId,
              timeoutMs: OTEL_REQUEST_BODY_READ_TIMEOUT_MS,
            });
            res.status(408);
            return { response: { error: "Request body read timed out" } };
          }

          throw error;
        } finally {
          clearTimeout(bodyReadTimeout);
        }
      },
      async run(request) {
        workerStarted = true;
        if (request.config.ingestionVersion) {
          getCurrentSpan()?.setAttribute(
            "langfuse.ingestion.version",
            request.config.ingestionVersion,
          );
        }
        try {
          return await processOtelIngestionInWorker(
            request,
            abortController.signal,
          );
        } catch (error) {
          if (abortController.signal.aborted) return undefined;
          throw error;
        } finally {
          cleanup();
        }
      },
    },
  };
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

export async function processOtelIngestionInWorker(
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
