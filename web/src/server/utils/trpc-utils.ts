import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";

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

export const getTRPCErrorCodeFromHTTPStatusCode = (
  httpStatus: number,
): TRPC_ERROR_CODE_KEY => {
  return HTTP_STATUS_CODE_TO_TRPC_ERROR_CODE[httpStatus] ?? DEFAULT_ERROR_CODE;
};
