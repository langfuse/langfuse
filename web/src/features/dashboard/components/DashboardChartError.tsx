import { TRPCClientError } from "@trpc/client";
import { AlertCircle } from "lucide-react";

/**
 * Checks if an error is a timeout error
 */
function isTimeoutError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    const httpStatus =
      typeof error.data?.httpStatus === "number" ? error.data.httpStatus : 0;
    // Check for status 524 (timeout) or error message containing timeout keywords
    if (httpStatus === 524) return true;
    const errorMessage = error.message?.toLowerCase() || "";
    return (
      errorMessage.includes("timeout") ||
      errorMessage.includes("timed out") ||
      errorMessage.includes("time out")
    );
  }
  if (error instanceof Error) {
    const errorMessage = error.message?.toLowerCase() || "";
    return (
      errorMessage.includes("timeout") ||
      errorMessage.includes("timed out") ||
      errorMessage.includes("time out")
    );
  }
  return false;
}

export function DashboardChartError({ error }: { error: unknown }) {
  const isTimeout = isTimeoutError(error);

  if (isTimeout) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Query timed out
        </h3>
        <p className="text-sm text-muted-foreground">
          For faster results, consider using a shorter time frame.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
      <h3 className="mb-2 text-lg font-semibold">Error loading chart</h3>
      <p className="text-sm text-muted-foreground">
        {error instanceof Error
          ? error.message
          : "An unexpected error occurred"}
      </p>
    </div>
  );
}
