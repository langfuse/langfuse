import React from "react";
import { isTimeoutError } from "@/src/features/dashboard/lib/dashboard-query-retry";
import { cn } from "@/src/utils/tailwind";

export function ChartErrorView({
  error,
  className,
}: {
  error: unknown;
  className?: string;
}) {
  const isTimeout = isTimeoutError(error);

  return (
    <div
      className={cn(
        "flex h-full min-h-[9rem] w-full flex-1 flex-col items-center justify-center gap-3 rounded-lg p-6 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-foreground">
        {isTimeout ? "Query timed out" : "Query failed"}
      </p>
      <p className="text-sm text-muted-foreground">
        For faster results, consider using a shorter time frame.
      </p>
    </div>
  );
}
