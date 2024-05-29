import { TRPCClientError } from "@trpc/client";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";

const errorTitleMap: Record<string, string> = {
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
};

export const trpcErrorToast = (error: unknown) => {
  if (error instanceof TRPCClientError) {
    const path = error.data?.path;
    const cause = error.data?.cause;
    const description = error.message;
    const errorTitle = errorTitleMap[error.data?.code] || "Unexpected Error";

    showErrorToast(errorTitle, description, cause, path);
  } else {
    showErrorToast(
      "Unexpected Error",
      "An unexpected error occurred. Please try again.",
    );
  }
};
