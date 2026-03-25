import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SLOW_QUERY_HINT_TEXT } from "@langfuse/shared";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type QueryProgress } from "@/src/hooks/useSSEDashboardQuery";
import { QueryProgressBar } from "@/src/features/widgets/chart-library/QueryProgressBar";
import { cn } from "@/src/utils/tailwind";

const DEFAULT_LEGACY_HINT_DELAY_MS = 2000;
const DEFAULT_PROGRESS_DELAY_MS = 1000;
const DEFAULT_MINIMAL_HINT_DELAY_MS = 3000;

type ChartLoadingStateProps = {
  isLoading: boolean;
  className?: string;
  spinnerClassName?: string;
  hintClassName?: string;
  spinnerLabel?: string;
  hintText?: string;
  variant?: "legacy" | "minimal";
  progressDelayMs?: number;
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
  variant = "legacy",
  progressDelayMs,
  hintDelayMs,
  showSpinner = true,
  showHintImmediately = false,
  progress,
  layout = "default",
}: ChartLoadingStateProps) {
  const isMinimal = variant === "minimal";
  const resolvedProgressDelayMs = progressDelayMs ?? DEFAULT_PROGRESS_DELAY_MS;
  const resolvedHintDelayMs =
    hintDelayMs ??
    (isMinimal ? DEFAULT_MINIMAL_HINT_DELAY_MS : DEFAULT_LEGACY_HINT_DELAY_MS);
  const [showProgress, setShowProgress] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowProgress(false);
      setShowHint(false);
      return;
    }

    setShowProgress(false);
    setShowHint(false);

    const progressTimeoutId =
      isMinimal && showSpinner
        ? window.setTimeout(() => {
            setShowProgress(true);
          }, resolvedProgressDelayMs)
        : null;
    const hintTimeoutId = showHintImmediately
      ? null
      : window.setTimeout(() => {
          setShowHint(true);
        }, resolvedHintDelayMs);

    return () => {
      if (progressTimeoutId !== null) {
        window.clearTimeout(progressTimeoutId);
      }
      if (hintTimeoutId !== null) {
        window.clearTimeout(hintTimeoutId);
      }
    };
  }, [
    isLoading,
    isMinimal,
    resolvedHintDelayMs,
    resolvedProgressDelayMs,
    showHintImmediately,
    showSpinner,
  ]);

  if (!isLoading) {
    return null;
  }

  const shouldShowProgress = isMinimal ? showSpinner && showProgress : progress;
  const shouldShowHint = showHintImmediately || showHint;
  const isCompact = layout !== "default";
  const isTight = layout === "tight";
  const statusTitle = showSpinner
    ? isMinimal
      ? "Running query..."
      : "Loading widget"
    : "Query needs attention";

  if (!isMinimal) {
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
            {!isCompact ? <ChartLoadingPreview /> : null}

            <div
              className={cn(
                "flex",
                isCompact
                  ? "items-start gap-3 text-left"
                  : "flex-col items-center gap-3 text-center",
              )}
            >
              <div
                className={cn(
                  "bg-background/80 border-border/60 flex shrink-0 items-center justify-center rounded-full border shadow-xs",
                  isCompact ? "h-9 w-9" : "h-10 w-10",
                )}
              >
                {showSpinner ? (
                  <Loader2
                    aria-hidden="true"
                    className={cn(
                      isCompact ? "h-4 w-4" : "h-5 w-5",
                      "animate-spin",
                      spinnerClassName,
                    )}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="bg-muted-foreground/60 block h-2.5 w-2.5 rounded-full"
                  />
                )}
              </div>

              <div
                className={cn("space-y-1", isCompact ? "min-w-0 flex-1" : "")}
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

            {shouldShowProgress ? (
              <QueryProgressBar progress={progress} layout={layout} />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

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
      <div className="m-auto flex w-full max-w-sm flex-col items-center justify-center px-4 py-6 text-center">
        <div className={cn("w-full", isCompact ? "space-y-4" : "space-y-5")}>
          <div className="flex justify-center">
            {showSpinner ? (
              <Loader2
                aria-hidden="true"
                className={cn(
                  "text-muted-foreground animate-spin",
                  isTight ? "h-4 w-4" : isCompact ? "h-5 w-5" : "h-6 w-6",
                  spinnerClassName,
                )}
              />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  "bg-muted-foreground/60 block rounded-full",
                  isCompact ? "h-2 w-2" : "h-2.5 w-2.5",
                )}
              />
            )}
          </div>

          <div className="space-y-1">
            <p
              className={cn(
                "text-foreground font-medium",
                isTight ? "text-xs" : "text-sm",
              )}
            >
              {statusTitle}
            </p>
          </div>

          {shouldShowProgress ? (
            <QueryProgressBar progress={progress ?? null} layout={layout} />
          ) : null}

          {shouldShowHint ? (
            <p
              className={cn(
                "animate-in fade-in-0 text-muted-foreground duration-300",
                isTight
                  ? "text-[11px] leading-4"
                  : isCompact
                    ? "text-xs leading-4"
                    : "text-xs leading-5",
                hintClassName,
              )}
            >
              {hintText}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
