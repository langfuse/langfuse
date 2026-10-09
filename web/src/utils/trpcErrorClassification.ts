import { TRPCClientError } from "@trpc/client";
import {
  TRPC_ERROR_CODES_BY_KEY,
  type TRPC_ERROR_CODE_KEY,
} from "@trpc/server/rpc";
import {
  type ToastErrorAnalytics,
  type ToastOperation,
} from "@/src/features/notifications/toastAnalytics";
import { isTrpcZodValidationError } from "@/src/utils/trpcValidationError";
import { getTrpcToastOperation } from "@/src/utils/trpcToastOperation";

type SyntaxErrorWithResponseStatus = SyntaxError & { responseStatus?: number };

/**
 * BAD_REQUEST is normally a client bug. These procedures also use it for
 * rejected user-configured values, so they belong to the user-input bucket.
 */
export const EXPECTED_TRPC_BAD_REQUEST_PATHS = [
  "datasets.triggerRemoteExperiment",
  "datasets.upsertRemoteExperiment",
  "models.upsert",
] as const;

const FAILED_FETCH_MESSAGE = /^failed to fetch(?: \([^)]+\))?$/i;

const getResponseStatus = (error: TRPCClientError<any>): number | undefined => {
  if (
    error.cause instanceof SyntaxError &&
    typeof (error.cause as SyntaxErrorWithResponseStatus).responseStatus ===
      "number"
  ) {
    return (error.cause as SyntaxErrorWithResponseStatus).responseStatus;
  }

  return error.meta?.response instanceof Response
    ? error.meta.response.status
    : undefined;
};

const getCode = (
  error: TRPCClientError<any>,
): TRPC_ERROR_CODE_KEY | undefined =>
  typeof error.data?.code === "string" &&
  Object.hasOwn(TRPC_ERROR_CODES_BY_KEY, error.data.code)
    ? (error.data.code as TRPC_ERROR_CODE_KEY)
    : undefined;

const getPath = (error: TRPCClientError<any>): string | undefined =>
  typeof error.data?.path === "string" ? error.data.path : undefined;

const getHttpStatus = (error: TRPCClientError<any>): number | undefined =>
  typeof error.data?.httpStatus === "number"
    ? error.data.httpStatus
    : getResponseStatus(error);

const withTransportMetadata = (
  error: TRPCClientError<any>,
  classification: Pick<ToastErrorAnalytics, "errorOrigin" | "errorCategory">,
  operation: ToastOperation,
): ToastErrorAnalytics => {
  const trpcCode = getCode(error);
  const httpStatus = getHttpStatus(error);
  const trpcPath = getTrpcToastOperation(error);

  return {
    ...classification,
    operation,
    ...(trpcCode ? { trpcCode } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(typeof error.data?.traceId === "string"
      ? { errorId: error.data.traceId }
      : {}),
    ...(trpcPath ? { trpcPath } : {}),
  };
};

export const classifyTrpcToastError = (
  error: unknown,
  operation: ToastOperation,
): ToastErrorAnalytics => {
  if (!(error instanceof TRPCClientError)) {
    const trpcPath = getTrpcToastOperation(error);
    if (
      trpcPath &&
      error instanceof TypeError &&
      FAILED_FETCH_MESSAGE.test(error.message)
    ) {
      return {
        operation,
        errorOrigin: "network",
        errorCategory: "transient",
        trpcPath,
      };
    }
    return {
      operation,
      errorOrigin: "frontend",
      errorCategory: "internal",
      ...(trpcPath ? { trpcPath } : {}),
    };
  }

  const classify = (
    classification: Pick<ToastErrorAnalytics, "errorOrigin" | "errorCategory">,
  ) => withTransportMetadata(error, classification, operation);

  const code = getCode(error);
  const path = getPath(error);
  const httpStatus = getHttpStatus(error);

  if (
    error.cause instanceof SyntaxError &&
    ![414, 431].includes(httpStatus ?? 0)
  ) {
    return classify({
      errorOrigin: "network",
      errorCategory: "transient",
    });
  }

  if ([414, 431].includes(httpStatus ?? 0)) {
    return classify({
      errorOrigin: "frontend",
      errorCategory: "internal",
    });
  }

  if (
    !error.data &&
    !error.meta?.response &&
    ((error.cause instanceof TypeError &&
      FAILED_FETCH_MESSAGE.test(error.cause.message)) ||
      FAILED_FETCH_MESSAGE.test(error.message))
  ) {
    return classify({
      errorOrigin: "network",
      errorCategory: "transient",
    });
  }

  if (
    isTrpcZodValidationError(error) ||
    (code === "BAD_REQUEST" &&
      path !== undefined &&
      (EXPECTED_TRPC_BAD_REQUEST_PATHS as readonly string[]).includes(path))
  ) {
    return classify({
      errorOrigin: "backend",
      errorCategory: "user_input",
    });
  }

  if (
    code === "UNAUTHORIZED" ||
    code === "FORBIDDEN" ||
    httpStatus === 401 ||
    httpStatus === 403
  ) {
    return classify({
      errorOrigin: "backend",
      errorCategory: "permission",
    });
  }

  if (
    code === "NOT_FOUND" ||
    code === "CONFLICT" ||
    code === "PRECONDITION_FAILED" ||
    [404, 409, 412].includes(httpStatus ?? 0)
  ) {
    return classify({
      errorOrigin: "backend",
      errorCategory: "product_state",
    });
  }

  if (code === "TOO_MANY_REQUESTS" || httpStatus === 429) {
    return classify({
      errorOrigin: "backend",
      errorCategory: "rate_limit",
    });
  }

  if (
    code === "PAYLOAD_TOO_LARGE" ||
    code === "UNPROCESSABLE_CONTENT" ||
    httpStatus === 413 ||
    httpStatus === 422
  ) {
    return classify({
      errorOrigin: "backend",
      errorCategory: "resource_limit",
    });
  }

  if (
    code === "TIMEOUT" ||
    code === "CLIENT_CLOSED_REQUEST" ||
    code === "SERVICE_UNAVAILABLE" ||
    [408, 499, 502, 503, 504, 524].includes(httpStatus ?? 0)
  ) {
    return classify({
      errorOrigin: "network",
      errorCategory: "transient",
    });
  }

  if (code === "INTERNAL_SERVER_ERROR" || (httpStatus ?? 0) >= 500) {
    return classify({
      errorOrigin: "backend",
      errorCategory: "internal",
    });
  }

  if (
    !error.data ||
    code === "BAD_REQUEST" ||
    code === "METHOD_NOT_SUPPORTED"
  ) {
    return classify({
      errorOrigin: "frontend",
      errorCategory: "internal",
    });
  }

  return classify({
    errorOrigin: "backend",
    errorCategory: "internal",
  });
};
