import { useEffect, useState } from "react";
import { cn } from "@/src/utils/tailwind";
import { SLOW_QUERY_HINT_TEXT } from "@langfuse/shared";
import { type QueryProgress } from "@/src/hooks/useSSEDashboardQuery";
import { QueryProgressBar } from "@/src/features/widgets/chart-library/QueryProgressBar";
import { Button } from "@/src/components/ui/button";
import Spinner from "@/src/components/design-system/Spinner/Spinner";

const DEFAULT_HINT_DELAY_MS = 2000;
const PROGRESS_REVEAL_DELAY_MS = 1000;

type ChartLoadingStateProps = {
  isLoading: boolean;
  className?: string;
  hintClassName?: string;
  spinnerLabel?: string;
  hintText?: string;
  hintDelayMs?: number;
  showSpinner?: boolean;
  showHintImmediately?: boolean;
  progress?: QueryProgress | null;
  layout?: "default" | "compact" | "tight";
  onRetry?: () => void;
  retryLabel?: string;
};

export function ChartLoadingState({
  isLoading,
  className,
  hintClassName,
  spinnerLabel = "Loading chart data",
  hintText = SLOW_QUERY_HINT_TEXT,
  hintDelayMs = DEFAULT_HINT_DELAY_MS,
  showSpinner = true,
  showHintImmediately = false,
  progress,
  layout = "default",
  onRetry,
  retryLabel = "Retry",
}: ChartLoadingStateProps) {
  const [showHint, setShowHint] = useState(false);
  const [showProgressPhase, setShowProgressPhase] = useState(false);
  const shouldShowProgress = progress !== undefined;
  const isPendingProgressState = isLoading && showSpinner && shouldShowProgress;

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

  useEffect(() => {
    if (!isPendingProgressState) {
      setShowProgressPhase(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowProgressPhase(true);
    }, PROGRESS_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isPendingProgressState]);

  if (!isLoading) {
    return null;
  }

  const shouldShowHint = showHintImmediately || showHint;
  const isCompact = layout !== "default";
  const isTight = layout === "tight";
  const isLegacySpinnerOnlyState = showSpinner && !shouldShowProgress;
  const isTightProgressState = isTight && shouldShowProgress;
  const shouldRenderStatusTitle = !isTightProgressState;
  const shouldRenderHint = shouldShowHint && !isTightProgressState;
  const shouldRenderRetry = Boolean(onRetry) && shouldShowHint && !showSpinner;

  if (
    isLegacySpinnerOnlyState ||
    (isPendingProgressState && !showProgressPhase)
  ) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={spinnerLabel}
        className={cn(
          "text-muted-foreground flex h-full w-full items-center justify-center",
          className,
        )}
      >
        <div className="flex h-4 w-4 items-center justify-center">
          <Spinner size="sm" />
        </div>
      </div>
    );
  }

  const statusTitle =
    isPendingProgressState || shouldShowProgress
      ? "Running query"
      : showSpinner
        ? "Loading widget"
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
      <div
        className={cn(
          "m-auto w-full",
          isTightProgressState
            ? "max-w-[12rem] px-3 py-2"
            : "max-w-sm px-4 py-4",
        )}
      >
        <div
          className={cn(
            "flex flex-col",
            isTightProgressState ? "gap-2" : isCompact ? "gap-3" : "gap-4",
          )}
        >
          {shouldRenderStatusTitle ? (
            <p
              className={cn(
                "text-foreground font-medium",
                shouldShowProgress ? "text-left" : "text-center",
                isTight ? "text-xs" : "text-sm",
              )}
            >
              {statusTitle}
            </p>
          ) : null}
          {shouldShowProgress ? (
            <QueryProgressBar progress={progress} layout={layout} />
          ) : showSpinner ? (
            <div className="flex h-4 w-4 items-center justify-center self-center">
              <Spinner size="sm" />
            </div>
          ) : null}

          {isTightProgressState ? null : (
            <p
              className={cn(
                "text-muted-foreground",
                shouldShowProgress ? "text-left" : "text-center",
                shouldRenderHint ? "animate-in fade-in-0 duration-300" : "",
                isTight
                  ? "line-clamp-3 min-h-12 text-[11px] leading-4"
                  : isCompact
                    ? "line-clamp-4 min-h-8 text-xs leading-4"
                    : "line-clamp-3 min-h-10 text-xs leading-5",
                hintClassName,
              )}
            >
              {shouldRenderHint ? (
                hintText
              ) : (
                <span aria-hidden="true">&nbsp;</span>
              )}
            </p>
          )}
          {shouldRenderRetry ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="w-fit self-center"
            >
              {retryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
