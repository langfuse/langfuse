import { TRPCClientError } from "@trpc/client";
import { type ToastErrorAnalytics } from "@/src/features/notifications/toastAnalytics";
import { isTrpcZodValidationError } from "@/src/utils/trpcValidationError";

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

const getCode = (error: TRPCClientError<any>): string | undefined =>
  typeof error.data?.code === "string" ? error.data.code : undefined;

const getPath = (error: TRPCClientError<any>): string | undefined =>
  typeof error.data?.path === "string" ? error.data.path : undefined;

const getHttpStatus = (error: TRPCClientError<any>): number | undefined =>
  typeof error.data?.httpStatus === "number"
    ? error.data.httpStatus
    : getResponseStatus(error);

const withTransportMetadata = (
  error: TRPCClientError<any>,
  classification: Pick<ToastErrorAnalytics, "errorOrigin" | "errorCategory">,
): ToastErrorAnalytics => {
  const trpcCode = getCode(error);
  const httpStatus = getHttpStatus(error);

  return {
    ...classification,
    ...(trpcCode ? { trpcCode } : {}),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
  };
};

export const classifyTrpcToastError = (error: unknown): ToastErrorAnalytics => {
  if (!(error instanceof TRPCClientError)) {
    return { errorOrigin: "frontend", errorCategory: "internal" };
  }

  const code = getCode(error);
  const path = getPath(error);
  const httpStatus = getHttpStatus(error);

  if (
    error.cause instanceof SyntaxError &&
    ![414, 431].includes(httpStatus ?? 0)
  ) {
    return withTransportMetadata(error, {
      errorOrigin: "network",
      errorCategory: "transient",
    });
  }

  if ([414, 431].includes(httpStatus ?? 0)) {
    return withTransportMetadata(error, {
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
    return withTransportMetadata(error, {
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
    return withTransportMetadata(error, {
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
    return withTransportMetadata(error, {
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
    return withTransportMetadata(error, {
      errorOrigin: "backend",
      errorCategory: "product_state",
    });
  }

  if (code === "TOO_MANY_REQUESTS" || httpStatus === 429) {
    return withTransportMetadata(error, {
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
    return withTransportMetadata(error, {
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
    return withTransportMetadata(error, {
      errorOrigin: "network",
      errorCategory: "transient",
    });
  }

  if (code === "INTERNAL_SERVER_ERROR" || (httpStatus ?? 0) >= 500) {
    return withTransportMetadata(error, {
      errorOrigin: "backend",
      errorCategory: "internal",
    });
  }

  if (
    !error.data ||
    code === "BAD_REQUEST" ||
    code === "METHOD_NOT_SUPPORTED"
  ) {
    return withTransportMetadata(error, {
      errorOrigin: "frontend",
      errorCategory: "internal",
    });
  }

  return withTransportMetadata(error, {
    errorOrigin: "backend",
    errorCategory: "unknown",
  });
};
