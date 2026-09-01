import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import Piscina from "piscina";

import type {
  OtelIngestionRequest,
  OtelIngestionResult,
} from "./processOtelIngestion";
import type { OtelIngestionWorkerRequest } from "./otelIngestionWorker";

let workerPool:
  | Piscina<OtelIngestionWorkerRequest, OtelIngestionResult>
  | undefined;
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
  run: (
    request: OtelIngestionRequest,
  ) => Promise<OtelIngestionResult | undefined>;
};

export type OtelIngestionWorkerLeaseResult =
  | { kind: "acquired"; lease: OtelIngestionWorkerLease }
  | { kind: "busy" }
  | { kind: "aborted" };

export async function createOtelIngestionWorkerLease(
  req: IncomingMessage,
  res: ServerResponse,
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
    return admission;
  }
  if (admission.kind === "aborted") {
    cleanup();
    return admission;
  }
  if (abortController.signal.aborted) {
    admission.release();
    cleanup();
    return { kind: "aborted" };
  }
  releaseWorker = admission.release;
  res.once("finish", cleanup);

  return {
    kind: "acquired",
    lease: {
      async run(request) {
        workerStarted = true;
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
  const body = getTransferableOtelBody(request.body);
  const workerRequest: OtelIngestionWorkerRequest = {
    ...request,
    body,
  };

  return getWorkerPool().run(workerRequest, {
    transferList: [body.buffer],
    signal,
  });
}
