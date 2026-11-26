import { TRPCClientError } from "@trpc/client";

/**
 * Correlation ids for a tRPC client error.
 *
 * JSON errors from both `httpLink` and `httpBatchLink` carry the response on
 * `error.meta.response`. A body that is not JSON throws
 * `TrpcNonJsonResponseError` and both links drop `meta.response`;
 * `annotateTrpcParseError` keeps the safe header values on that error.
 * Gateway HTML (502/504) often has neither header, and the missing ids are
 * omitted rather than invented.
 *
 * Tags are `request_id` and `dd.trace_id`. Values are re-checked with the
 * same allowlist the server uses before they reach Sentry.
 */

export const TRPC_REQUEST_ID_HEADER = "x-request-id";
export const TRPC_DD_TRACE_ID_HEADER = "x-dd-trace-id";

const TRPC_REQUEST_ID_TAG = "request_id";
const TRPC_DD_TRACE_ID_TAG = "dd.trace_id";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_32_PATTERN = /^[0-9a-f]{32}$/i;
const HEX_16_PATTERN = /^[0-9a-f]{16}$/i;
const CF_RAY_PATTERN = /^[0-9a-f]{16}-[A-Za-z]{3}$/;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const NIL_TRACE_ID = "0".repeat(32);

type TrpcCorrelation = {
  requestId?: string;
  traceId?: string;
};

type AnnotatedParseError = Error & {
  trpcCorrelation?: TrpcCorrelation;
};

/**
 * Gateway request ids we will echo: UUID, 16/32 hex (nginx / Envoy), or a
 * Cloudflare ray id. Case is preserved so a log search matches the gateway.
 * Emails, user ids, secrets, and header-injection payloads do not match.
 */
export function sanitizeRequestId(value: unknown): string | undefined {
  const candidate = firstHeaderValue(value);
  if (!candidate) return undefined;
  if (UUID_PATTERN.test(candidate)) {
    return candidate.toLowerCase() === NIL_UUID ? undefined : candidate;
  }
  if (HEX_32_PATTERN.test(candidate) || HEX_16_PATTERN.test(candidate)) {
    return /^0+$/i.test(candidate) ? undefined : candidate;
  }
  if (CF_RAY_PATTERN.test(candidate)) return candidate;
  return undefined;
}

/** Recording OTEL trace id: 32 hex chars, lowercase, never the nil id. */
export function sanitizeTraceId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim();
  if (!HEX_32_PATTERN.test(candidate)) return undefined;
  const traceId = candidate.toLowerCase();
  return traceId === NIL_TRACE_ID ? undefined : traceId;
}

function firstHeaderValue(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readTrpcCorrelationHeaders(headers: Headers): TrpcCorrelation {
  return {
    requestId: sanitizeRequestId(headers.get(TRPC_REQUEST_ID_HEADER)),
    traceId: sanitizeTraceId(headers.get(TRPC_DD_TRACE_ID_HEADER)),
  };
}

/**
 * Stash safe correlation headers on a non-JSON response error. tRPC does not
 * attach `meta.response` when `res.json()` throws.
 */
export function annotateTrpcParseError<T extends Error>(
  error: T,
  response: Response,
): T {
  const correlation = readTrpcCorrelationHeaders(response.headers);
  if (!correlation.requestId && !correlation.traceId) return error;
  (error as AnnotatedParseError).trpcCorrelation = correlation;
  return error;
}

function correlationFromError(error: unknown): TrpcCorrelation {
  if (!(error instanceof Error)) return {};
  const stored = (error as AnnotatedParseError).trpcCorrelation;
  return {
    requestId: sanitizeRequestId(stored?.requestId),
    traceId: sanitizeTraceId(stored?.traceId),
  };
}

function correlationFromCause(cause: unknown): TrpcCorrelation {
  const direct = correlationFromError(cause);
  if (direct.requestId || direct.traceId) return direct;
  return cause instanceof Error ? correlationFromError(cause.cause) : {};
}

function traceIdFromData(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("traceId" in data)) {
    return undefined;
  }
  return sanitizeTraceId(data.traceId);
}

/**
 * Header values win. `data.traceId` (set by the tRPC error formatter for
 * JSON errors) fills in when a proxy stripped the response header.
 */
function trpcErrorCorrelation(error: unknown): TrpcCorrelation {
  if (!(error instanceof TRPCClientError)) return {};

  const fromResponse =
    error.meta?.response instanceof Response
      ? readTrpcCorrelationHeaders(error.meta.response.headers)
      : {};
  const fromCause = correlationFromCause(error.cause);

  return {
    requestId: fromResponse.requestId ?? fromCause.requestId,
    traceId:
      fromResponse.traceId ?? fromCause.traceId ?? traceIdFromData(error.data),
  };
}

export function trpcCorrelationTags(error: unknown): Record<string, string> {
  const correlation = trpcErrorCorrelation(error);
  const tags: Record<string, string> = {};
  if (correlation.requestId) {
    tags[TRPC_REQUEST_ID_TAG] = correlation.requestId;
  }
  if (correlation.traceId) {
    tags[TRPC_DD_TRACE_ID_TAG] = correlation.traceId;
  }
  return tags;
}
