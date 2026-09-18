import type { IncomingMessage } from "node:http";

import { getCurrentSpan, logger } from "@langfuse/shared/src/server";
import type { NextApiResponse } from "next";

import type {
  OtelIngestionRequest,
  OtelIngestionResult,
} from "./processOtelIngestion";
import type { OtelIngestionWorkerRequest } from "./otelIngestionWorker";
import {
  dispatchOtelIngestionWorkerTask,
  tryScheduleOtelIngestionWorkerLifecycle,
} from "./otelIngestionWorkerPool";
import { readOtelRequestBody } from "./otelRequestBody";

const OTEL_REQUEST_BODY_READ_TIMEOUT_MS = 300_000;

let workerCompletionLogged = false;

function isRequestClosed(req: IncomingMessage): boolean {
  return req.destroyed || req.readableAborted || !req.readable;
}

function isResponseClosed(res: NextApiResponse): boolean {
  return (
    res.destroyed || res.closed || res.writableEnded || res.writableFinished
  );
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
 * Keeps one shared admission task alive across the body read, route validation,
 * worker execution, and response. This is why the HTTP lifecycle and its abort
 * signals live together while the pool remains transport-agnostic.
 */
export async function createOtelIngestionWorkerContext(
  req: IncomingMessage,
  res: NextApiResponse,
  projectId: string,
  maxBodyBytes: number,
): Promise<OtelIngestionWorkerContextResult> {
  if (isRequestClosed(req) || isResponseClosed(res)) {
    return { response: {} };
  }

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
  res.once("close", onResponseClose);

  if (
    requestAbortController.signal.aborted ||
    isRequestClosed(req) ||
    isResponseClosed(res)
  ) {
    cleanup();
    resolveContext({ response: {} });
    return contextResult;
  }

  const workerTask = tryScheduleOtelIngestionWorkerLifecycle(async (signal) => {
    queueTaskStarted = true;
    res.once("finish", cleanup);
    if (
      signal?.aborted ||
      requestAbortController.signal.aborted ||
      isRequestClosed(req) ||
      isResponseClosed(res)
    ) {
      cleanup();
      resolveContext({ response: {} });
      return;
    }

    let processPromise: Promise<OtelIngestionResult | undefined> =
      Promise.resolve(undefined);
    try {
      const bodyReadTimeoutSignal = AbortSignal.timeout(
        OTEL_REQUEST_BODY_READ_TIMEOUT_MS,
      );

      let body: Buffer;
      try {
        const bodyPromise = readOtelRequestBody(
          req,
          maxBodyBytes,
          requestAbortController.signal,
        );
        let onBodyReadTimeout: (() => void) | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          onBodyReadTimeout = () => reject(bodyReadTimeoutSignal.reason);
          if (bodyReadTimeoutSignal.aborted) {
            onBodyReadTimeout();
          } else {
            bodyReadTimeoutSignal.addEventListener("abort", onBodyReadTimeout, {
              once: true,
            });
          }
        });
        req.resume();
        try {
          body = await Promise.race([bodyPromise, timeoutPromise]);
        } finally {
          if (onBodyReadTimeout) {
            bodyReadTimeoutSignal.removeEventListener(
              "abort",
              onBodyReadTimeout,
            );
          }
        }
      } catch (error) {
        if (requestAbortController.signal.aborted) {
          cleanup();
          resolveContext({ response: {} });
        } else if (bodyReadTimeoutSignal.aborted) {
          // Keep the request signal reserved for genuine client cancellation.
          // Drain the timed-out body without aborting the IncomingMessage.
          req.resume();
          logger.warn("OTel request body read timed out", {
            projectId,
            timeoutMs: OTEL_REQUEST_BODY_READ_TIMEOUT_MS,
          });
          res.setHeader("Connection", "close");
          res.status(408);
          resolveContext({
            response: { error: "Request body read timed out" },
          });
        } else {
          rejectContext(error);
        }
        return;
      }

      if (requestAbortController.signal.aborted) {
        cleanup();
        resolveContext({ response: {} });
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

          processPromise = dispatchOtelIngestion(
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
    } catch (error) {
      rejectContext(error);
    } finally {
      await lifecycle;
      await processPromise.catch(() => undefined);
    }
  }, queueAbortController.signal);

  if (!workerTask) {
    cleanup();
    res.setHeader("Retry-After", 1);
    res.setHeader("Connection", "close");
    res.status(503);
    return { response: { error: "OTel ingestion worker is busy" } };
  }

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

async function dispatchOtelIngestion(
  request: OtelIngestionRequest,
  signal: AbortSignal,
): Promise<OtelIngestionResult> {
  const decodedBodyBytes = request.body.byteLength;
  const body = getTransferableOtelBody(request.body);
  const workerRequest: OtelIngestionWorkerRequest = {
    ...request,
    body,
  };

  const span = getCurrentSpan();
  span?.setAttribute("langfuse.ingestion.otel.worker_used", true);
  const startedAt = performance.now();

  try {
    const result = await dispatchOtelIngestionWorkerTask(workerRequest, {
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
