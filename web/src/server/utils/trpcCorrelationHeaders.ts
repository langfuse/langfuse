import { randomUUID } from "node:crypto";

import type { Span } from "@opentelemetry/api";
import {
  sanitizeRequestId,
  sanitizeTraceId,
  TRPC_DD_TRACE_ID_HEADER,
  TRPC_REQUEST_ID_HEADER,
} from "@/src/utils/trpcCorrelation";

const BUILD_ID_HEADER = "x-build-id";
const REQUEST_ID_SPAN_ATTRIBUTE = "request_id";

/**
 * Headers for one tRPC HTTP response. Batching does not change this: a batch
 * is still one request, one trace, one pair of ids.
 *
 * `x-request-id` prefers a safe incoming gateway id (see
 * `sanitizeRequestId`). Otherwise it is the recording OTEL trace id, then a
 * generated UUID. `x-dd-trace-id` is only that trace id — pass the value
 * from `getActiveTraceId`, which is absent for unsampled spans.
 *
 * A recording span is tagged `request_id` with the same safe value so the
 * id on a Sentry event can be searched on the Datadog trace.
 */
export function buildTrpcCorrelationHeaders(input: {
  buildId: string | undefined;
  incomingRequestId: unknown;
  traceId: string | undefined;
  span?: Span;
  createRequestId?: () => string;
}): Record<string, string> {
  const traceId = sanitizeTraceId(input.traceId);
  const requestId =
    sanitizeRequestId(input.incomingRequestId) ??
    traceId ??
    sanitizeRequestId((input.createRequestId ?? randomUUID)());

  const headers: Record<string, string> = {};
  if (typeof input.buildId === "string") {
    headers[BUILD_ID_HEADER] = input.buildId;
  }
  if (requestId) headers[TRPC_REQUEST_ID_HEADER] = requestId;
  if (traceId) headers[TRPC_DD_TRACE_ID_HEADER] = traceId;

  if (requestId && input.span?.isRecording()) {
    input.span.setAttribute(REQUEST_ID_SPAN_ATTRIBUTE, requestId);
  }

  return headers;
}
