import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { type IncomingHttpHeaders } from "node:http";

export const OTEL_TRACE_REQUEST_BODY_MAX_BYTES = 16 * 1024 * 1024;
export const OTEL_TRACE_REQUEST_MAX_RESOURCE_SPANS = 10_000;
export const OTEL_TRACE_REQUEST_MAX_SPANS = 100_000;

export class OtelTraceRequestLimitError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "OtelTraceRequestLimitError";
    this.statusCode = statusCode;
  }
}

type LimitExceededAction = "destroy" | "resume";

type ReadStreamWithByteLimitOptions = {
  limitExceededAction?: LimitExceededAction;
};

const getSingleHeaderValue = (
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined => {
  const value = headers[name];
  if (typeof value === "string") return value;
  return value?.[0];
};

export const validateOtelTraceContentLength = (
  headers: IncomingHttpHeaders,
) => {
  const contentLengthHeader = getSingleHeaderValue(headers, "content-length");

  if (!contentLengthHeader) {
    throw new OtelTraceRequestLimitError(
      411,
      "Content-Length header is required",
    );
  }

  const contentLength = Number(contentLengthHeader);
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength < 0 ||
    String(contentLength) !== contentLengthHeader.trim()
  ) {
    throw new OtelTraceRequestLimitError(400, "Invalid Content-Length header");
  }

  if (contentLength > OTEL_TRACE_REQUEST_BODY_MAX_BYTES) {
    throw new OtelTraceRequestLimitError(
      413,
      `OTel trace request body exceeds the ${OTEL_TRACE_REQUEST_BODY_MAX_BYTES} byte limit`,
    );
  }
};

export const readStreamWithByteLimit = async (
  stream: Readable,
  maxBytes: number,
  options: ReadStreamWithByteLimitOptions = {},
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const limitExceededAction = options.limitExceededAction ?? "destroy";

    const cleanup = () => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
    };

    const rejectOnce = (error: Error, action?: LimitExceededAction) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (action === "destroy") {
        stream.destroy();
      } else if (action === "resume") {
        stream.resume();
      }
      reject(error);
    };

    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;

      if (bytes > maxBytes) {
        rejectOnce(
          new OtelTraceRequestLimitError(
            413,
            `OTel trace request body exceeds the ${maxBytes} byte limit`,
          ),
          limitExceededAction,
        );
        return;
      }

      chunks.push(buffer);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, bytes));
    };

    const onError = (error: Error) => {
      rejectOnce(error);
    };

    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
  });

export const decompressGzipWithByteLimit = async (
  body: Buffer,
  maxBytes = OTEL_TRACE_REQUEST_BODY_MAX_BYTES,
): Promise<Buffer> => {
  const gunzip = createGunzip();
  const source = Readable.from([body]);
  source.pipe(gunzip);

  try {
    return await readStreamWithByteLimit(gunzip, maxBytes);
  } finally {
    source.destroy();
  }
};

export const getOtelTraceBatchCounts = (
  resourceSpans: unknown,
): { resourceSpanCount: number; spanCount: number } => {
  if (!Array.isArray(resourceSpans)) {
    throw new OtelTraceRequestLimitError(400, "Invalid OTel resourceSpans");
  }

  if (resourceSpans.length > OTEL_TRACE_REQUEST_MAX_RESOURCE_SPANS) {
    throw new OtelTraceRequestLimitError(
      413,
      `OTel trace request exceeds the ${OTEL_TRACE_REQUEST_MAX_RESOURCE_SPANS} resourceSpans limit`,
    );
  }

  let spanCount = 0;
  for (const resourceSpan of resourceSpans) {
    const scopeSpans = Array.isArray(resourceSpan?.scopeSpans)
      ? resourceSpan.scopeSpans
      : [];

    for (const scopeSpan of scopeSpans) {
      if (Array.isArray(scopeSpan?.spans)) {
        spanCount += scopeSpan.spans.length;
        if (spanCount > OTEL_TRACE_REQUEST_MAX_SPANS) {
          throw new OtelTraceRequestLimitError(
            413,
            `OTel trace request exceeds the ${OTEL_TRACE_REQUEST_MAX_SPANS} spans limit`,
          );
        }
      }
    }
  }

  return {
    resourceSpanCount: resourceSpans.length,
    spanCount,
  };
};
