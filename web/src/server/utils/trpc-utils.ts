import { TRPCError, type TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { logger, traceException } from "@langfuse/shared/src/server";

// Note: copied from official documentation: https://trpc.io/docs/server/error-handling#error-codes
const HTTP_STATUS_CODE_TO_TRPC_ERROR_CODE: Record<number, TRPC_ERROR_CODE_KEY> =
  {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    402: "PAYMENT_REQUIRED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_SUPPORTED",
    408: "TIMEOUT",
    409: "CONFLICT",
    412: "PRECONDITION_FAILED",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "UNPROCESSABLE_CONTENT",
    429: "TOO_MANY_REQUESTS",
    499: "CLIENT_CLOSED_REQUEST",
    500: "INTERNAL_SERVER_ERROR",
    501: "NOT_IMPLEMENTED",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
  };

const DEFAULT_ERROR_CODE: TRPC_ERROR_CODE_KEY = "INTERNAL_SERVER_ERROR";

const originalErrorKey = Symbol("trpc.originalError");

export const getTRPCErrorCodeFromHTTPStatusCode = (
  httpStatus: number,
): TRPC_ERROR_CODE_KEY => {
  return HTTP_STATUS_CODE_TO_TRPC_ERROR_CODE[httpStatus] ?? DEFAULT_ERROR_CODE;
};

type TRPCErrorLogLevel = "info" | "warn" | "error";

const isServerErrorStatus = (httpStatus: number) =>
  httpStatus >= 500 && httpStatus < 600;

const getLogLevelFromHTTPStatus = (httpStatus: number): TRPCErrorLogLevel => {
  if (isServerErrorStatus(httpStatus)) return "error";
  if (httpStatus === 401 || httpStatus === 404) return "info";
  return "warn";
};

export const getTRPCErrorReporting = (
  error: TRPCError,
): {
  httpStatus: number;
  logLevel: TRPCErrorLogLevel;
  shouldTrace: boolean;
} => {
  const httpStatus = getHTTPStatusCodeFromError(error);

  return {
    httpStatus,
    logLevel: getLogLevelFromHTTPStatus(httpStatus),
    shouldTrace: isServerErrorStatus(httpStatus),
  };
};

/**
 * Builds the error sent to the client for a 5xx: no cause, so no stack trace
 * is exposed. The original error is kept under a non-enumerable symbol so
 * error reporting can still trace the real cause; it never reaches the
 * response.
 */
export const createScrubbedError = ({
  code,
  message,
  original,
}: {
  code: TRPC_ERROR_CODE_KEY;
  message: string;
  original: unknown;
}) => {
  const error = new TRPCError({ code, message, cause: null });
  Object.defineProperty(error, originalErrorKey, {
    value: original,
    enumerable: false,
  });
  return error;
};

const getOriginalError = (error: TRPCError): unknown =>
  (error as unknown as Record<symbol, unknown>)[originalErrorKey];

export const reportTRPCError = ({
  path,
  error,
}: {
  path: string | undefined;
  error: TRPCError;
}) => {
  const { logLevel, shouldTrace } = getTRPCErrorReporting(error);
  const message = `tRPC route failed on ${path ?? "<no-path>"}: ${error.message}`;

  if (logLevel === "error") {
    logger.error(message, error);
  } else if (logLevel === "warn") {
    logger.warn(message, error);
  } else {
    logger.info(message, error);
  }

  if (shouldTrace) {
    traceException(getOriginalError(error) ?? error);
  }

  return error;
};
