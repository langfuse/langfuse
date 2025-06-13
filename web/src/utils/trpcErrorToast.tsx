import { TRPCClientError } from "@trpc/client";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";

// Catch network level errors, e.g. by proxy rate-limiting

const httpStatusOverride: Record<number, keyof typeof errorTitleMap> = {
  429: "TOO_MANY_REQUESTS",
  524: "TIMEOUT",
};

const errorTitleMap = {
  BAD_REQUEST: "Bad Request",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  NOT_FOUND: "Not Found",
  TIMEOUT: "Timeout",
  CONFLICT: "Conflict",
  PRECONDITION_FAILED: "Precondition Failed",
  PAYLOAD_TOO_LARGE: "Payload Too Large",
  METHOD_NOT_SUPPORTED: "Method Not Supported",
  UNPROCESSABLE_CONTENT: "Unprocessable Content",
  TOO_MANY_REQUESTS: "Too Many Requests",
  CLIENT_CLOSED_REQUEST: "Client Closed Request",
  INTERNAL_SERVER_ERROR: "Internal Server Error",
} as const;

const getErrorTitleAndHttpCode = (error: TRPCClientError<any>) => {
  const httpStatus: number =
    typeof error.data?.httpStatus === "number" ? error.data.httpStatus : 500;

  if (httpStatus in httpStatusOverride) {
    return {
      errorTitle: errorTitleMap[httpStatusOverride[httpStatus]],
      httpStatus,
    };
  }

  const errorTitle =
    error.data?.code in errorTitleMap
      ? errorTitleMap[error.data?.code as keyof typeof errorTitleMap]
      : "Unexpected Error";

  return { errorTitle, httpStatus };
};

const getErrorDescription = (httpStatus: number) => {
  switch (httpStatus) {
    case 429:
      return "Rate limit hit. Please try again later.";
    case 524:
      return "Request took too long to process. Please try again later.";
    default:
      // Check if it's a 5xx server error
      if (httpStatus >= 500 && httpStatus < 600) {
        return "Internal server error. We've received an alert about this issue and will be working on fixing it. Please reach out to support if this persists.";
      }
      return "Internal error";
  }
};

export const trpcErrorToast = (error: unknown) => {
  if (error instanceof TRPCClientError) {
    const { errorTitle, httpStatus } = getErrorTitleAndHttpCode(error);

    const path = error.data?.path;
    const description = getErrorDescription(httpStatus);

    showErrorToast(
      errorTitle,
      error.message ?? description,
      httpStatus >= 500 && httpStatus < 600 ? "ERROR" : "WARNING",
      path,
    );
  } else {
    showErrorToast(
      "Unexpected Error",
      "An unexpected error occurred.",
      "ERROR",
    );
  }
};
