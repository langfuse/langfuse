import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SLOW_QUERY_HINT_TEXT } from "@langfuse/shared";
import { type QueryProgress } from "@/src/hooks/useSSEDashboardQuery";
import { QueryProgressBar } from "@/src/features/widgets/chart-library/QueryProgressBar";
import { cn } from "@/src/utils/tailwind";

const DEFAULT_PROGRESS_DELAY_MS = 1000;
const DEFAULT_HINT_DELAY_MS = 3000;

type ChartLoadingStateProps = {
  isLoading: boolean;
  className?: string;
  spinnerClassName?: string;
  hintClassName?: string;
  spinnerLabel?: string;
  hintText?: string;
  progressDelayMs?: number;
  hintDelayMs?: number;
  showSpinner?: boolean;
  showHintImmediately?: boolean;
  progress?: QueryProgress | null;
  layout?: "default" | "compact" | "tight";
};

export function ChartLoadingState({
  isLoading,
  className,
  spinnerClassName,
  hintClassName,
  spinnerLabel = "Loading chart data",
  hintText = SLOW_QUERY_HINT_TEXT,
  progressDelayMs = DEFAULT_PROGRESS_DELAY_MS,
  hintDelayMs = DEFAULT_HINT_DELAY_MS,
  showSpinner = true,
  showHintImmediately = false,
  progress,
  layout = "default",
}: ChartLoadingStateProps) {
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

    const progressTimeoutId = showSpinner
      ? window.setTimeout(() => {
          setShowProgress(true);
        }, progressDelayMs)
      : null;
    const hintTimeoutId = showHintImmediately
      ? null
      : window.setTimeout(() => {
          setShowHint(true);
        }, hintDelayMs);

    return () => {
      if (progressTimeoutId !== null) {
        window.clearTimeout(progressTimeoutId);
      }
      if (hintTimeoutId !== null) {
        window.clearTimeout(hintTimeoutId);
      }
    };
  }, [
    hintDelayMs,
    isLoading,
    progressDelayMs,
    showHintImmediately,
    showSpinner,
  ]);

  if (!isLoading) {
    return null;
  }

  const shouldShowProgress = showSpinner && showProgress;
  const shouldShowHint = showHintImmediately || showHint;
  const isCompact = layout !== "default";
  const isTight = layout === "tight";
  const statusTitle = showSpinner
    ? "Running query..."
    : "Query needs attention";

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
