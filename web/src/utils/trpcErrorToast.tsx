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
  SERVICE_UNAVAILABLE: "Internal Server Error",
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

const getErrorDescription = (
  httpStatus: number,
  errorCode?: string,
  path?: string,
) => {
  // Build context about what operation failed
  const operationContext = path
    ? ` while calling ${path}`
    : " during the operation";

  switch (httpStatus) {
    case 400:
      return `Bad request${operationContext}. Please check your input and try again.`;
    case 401:
      return `Authentication failed${operationContext}. Please sign in again.`;
    case 403:
      return `Access forbidden${operationContext}. You don't have permission to perform this action.`;
    case 404:
      return `Resource not found${operationContext}. The requested resource may have been deleted or doesn't exist.`;
    case 409:
      return `Conflict${operationContext}. The resource may have been modified by another user. Please refresh and try again.`;
    case 412:
      return `Precondition failed${operationContext}. Please refresh the page and try again.`;
    case 413:
      return `Payload too large${operationContext}. The data you're trying to send is too large.`;
    case 422:
      return `Validation error${operationContext}. Please check your input and try again.`;
    case 429:
      return "Rate limit hit. Please try again later.";
    case 524:
      return "Request took too long to process. Please try again later.";
    default:
      // Check if it's a 5xx server error
      if (httpStatus >= 500 && httpStatus < 600) {
        return `Internal server error${operationContext}. We've received an alert about this issue and will be working on fixing it. Please reach out to support if this persists.`;
      }
      // For other status codes, provide generic context
      return `An error occurred${operationContext}. Please try again or contact support if the issue persists.`;
  }
};

export const trpcErrorToast = (error: unknown) => {
  if (error instanceof TRPCClientError) {
    const { errorTitle, httpStatus } = getErrorTitleAndHttpCode(error);

    const path = error.data?.path;
    const errorCode = error.data?.code;
    const serverMessage = error.message;

    // Prefer server message if available and meaningful, otherwise use contextual description
    const description =
      serverMessage && serverMessage.trim().length > 0
        ? serverMessage
        : getErrorDescription(httpStatus, errorCode, path);

    showErrorToast(
      errorTitle,
      description,
      httpStatus >= 500 && httpStatus < 600 ? "ERROR" : "WARNING",
      path,
    );
  } else {
    // For non-TRPC errors, provide more context
    const errorType =
      error instanceof Error ? error.constructor.name : typeof error;
    const errorMessage =
      error instanceof Error
        ? error.message || "An unexpected error occurred."
        : "An unexpected error occurred.";

    const description =
      error instanceof Error && error.message
        ? errorMessage
        : `An unexpected error occurred (${errorType}). Please try again or contact support if the issue persists.`;

    showErrorToast("Unexpected Error", description, "ERROR");
  }
};
