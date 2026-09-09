import type { IncomingMessage } from "node:http";
import { addAbortSignal } from "node:stream";
import { gunzip } from "node:zlib";

import {
  getCurrentSpan,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";
import type { NextApiResponse } from "next";
import getRawBody from "raw-body";

export class OtelRequestBodyTooLargeError extends Error {
  constructor(
    public readonly maxBytes: number,
    public readonly afterDecompression = false,
  ) {
    const maxMiB = maxBytes / (1024 * 1024);
    const limit = Number.isInteger(maxMiB)
      ? `${maxMiB} MiB`
      : `${maxBytes} bytes`;
    const suffix = afterDecompression ? " after decompression" : "";

    super(`OTel request body exceeds the ${limit} limit${suffix}`);
    this.name = "OtelRequestBodyTooLargeError";
  }
}

export function handleOtelRequestBodyTooLarge(
  error: OtelRequestBodyTooLargeError,
  req: IncomingMessage,
  res: NextApiResponse,
  projectId: string,
) {
  const stage = error.afterDecompression ? "decompressed" : "encoded";

  if (!error.afterDecompression) {
    // raw-body intentionally pauses on overflow. Drain what remains while
    // closing this connection so subsequent requests are not queued here.
    req.resume();
    res.setHeader("Connection", "close");
  }

  logger.warn("Rejecting oversized OTEL request body", {
    projectId,
    maxBodyBytes: error.maxBytes,
    afterDecompression: error.afterDecompression,
  });
  recordIncrement("langfuse.ingestion.otel.request_body_limit_exceeded", 1, {
    stage,
  });
  getCurrentSpan()?.setAttributes({
    "langfuse.ingestion.otel.request_body_limit_exceeded": true,
    "langfuse.ingestion.otel.request_body_limit_bytes": error.maxBytes,
    "langfuse.ingestion.otel.request_body_limit_stage": stage,
  });
  res.status(413);
  return { error: error.message };
}

type RawBodyError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

function isRawBodyTooLargeError(error: unknown): error is RawBodyError {
  if (!(error instanceof Error)) return false;

  const rawBodyError = error as RawBodyError;
  return (
    rawBodyError.status === 413 ||
    rawBodyError.statusCode === 413 ||
    rawBodyError.type === "entity.too.large"
  );
}

export async function readOtelRequestBody(
  req: IncomingMessage,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  try {
    return await getRawBody(signal ? addAbortSignal(signal, req) : req, {
      length: req.headers["content-length"],
      limit: maxBytes,
    });
  } catch (error) {
    if (isRawBodyTooLargeError(error)) {
      throw new OtelRequestBodyTooLargeError(maxBytes);
    }

    throw error;
  }
}

export function gunzipOtelRequestBody(
  body: Buffer,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    gunzip(body, { maxOutputLength: maxBytes }, (error, result) => {
      if (!error) {
        resolve(result);
        return;
      }

      if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
        reject(new OtelRequestBodyTooLargeError(maxBytes, true));
        return;
      }

      reject(error);
    });
  });
}
