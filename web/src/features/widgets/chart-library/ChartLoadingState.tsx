import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { SLOW_QUERY_HINT_TEXT } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type QueryProgress } from "@/src/hooks/useSSEDashboardQuery";
import { QueryProgressBar } from "@/src/features/widgets/chart-library/QueryProgressBar";

const DEFAULT_HINT_DELAY_MS = 2000;

type ChartLoadingStateProps = {
  isLoading: boolean;
  className?: string;
  spinnerClassName?: string;
  hintClassName?: string;
  spinnerLabel?: string;
  hintText?: string;
  hintDelayMs?: number;
  showSpinner?: boolean;
  showHintImmediately?: boolean;
  progress?: QueryProgress | null;
  layout?: "default" | "compact" | "tight";
};

function ChartLoadingPreview() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="flex items-end gap-2">
        <Skeleton className="h-12 flex-1 rounded-xl" />
        <Skeleton className="h-[4.5rem] flex-1 rounded-xl" />
        <Skeleton className="h-8 flex-1 rounded-xl" />
        <Skeleton className="h-14 flex-1 rounded-xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-2 flex-1 rounded-full" />
        <Skeleton className="h-2 w-[4.5rem] rounded-full" />
      </div>
    </div>
  );
}

export function ChartLoadingState({
  isLoading,
  className,
  spinnerClassName,
  hintClassName,
  spinnerLabel = "Loading chart data",
  hintText = SLOW_QUERY_HINT_TEXT,
  hintDelayMs = DEFAULT_HINT_DELAY_MS,
  showSpinner = true,
  showHintImmediately = false,
  progress,
  layout = "default",
}: ChartLoadingStateProps) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowHint(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowHint(true);
    }, hintDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hintDelayMs, isLoading]);

  if (!isLoading) {
    return null;
  }

  const shouldShowHint = showHintImmediately || showHint;
  const isCompact = layout !== "default";
  const isTight = layout === "tight";
  const isTextOnlyState = !showSpinner;
  const statusTitle = showSpinner ? "Loading widget" : "Query needs attention";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={spinnerLabel}
      className={cn(
        "text-muted-foreground flex h-full min-h-0 w-full flex-col overflow-hidden",
        className,
      )}
    >
      <div className="m-auto w-full max-w-sm px-4 py-4">
        <div className={cn("flex flex-col", isCompact ? "gap-3" : "gap-5")}>
          {!isCompact && !isTextOnlyState ? <ChartLoadingPreview /> : null}

          <div
            className={cn(
              "flex",
              isTextOnlyState
                ? "justify-center text-center"
                : isCompact
                  ? "items-start gap-3 text-left"
                  : "flex-col items-center gap-3 text-center",
            )}
          >
            {showSpinner ? (
              <div
                className={cn(
                  "bg-background/80 border-border/60 flex shrink-0 items-center justify-center rounded-full border shadow-xs",
                  isCompact ? "h-9 w-9" : "h-10 w-10",
                )}
              >
                <Loader2
                  className={cn(
                    isCompact ? "h-4 w-4" : "h-5 w-5",
                    "animate-spin",
                    spinnerClassName,
                  )}
                />
              </div>
            ) : null}

            <div
              className={cn(
                "space-y-1",
                isCompact && !isTextOnlyState ? "min-w-0 flex-1" : "",
              )}
            >
              <p
                className={cn(
                  "text-foreground font-medium",
                  isTight ? "text-xs" : "text-sm",
                )}
              >
                {statusTitle}
              </p>
              {shouldShowHint ? (
                <p
                  className={cn(
                    "animate-in fade-in-0 text-muted-foreground duration-300",
                    isTight
                      ? "line-clamp-3 text-[11px] leading-4"
                      : isCompact
                        ? "line-clamp-4 text-xs leading-4"
                        : "line-clamp-3 text-xs leading-5",
                    hintClassName,
                  )}
                >
                  {hintText}
                </p>
              ) : null}
            </div>
          </div>

          {progress ? (
            <QueryProgressBar progress={progress} layout={layout} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
