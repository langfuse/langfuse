import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { SLOW_QUERY_HINT_TEXT } from "@langfuse/shared";

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
};

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

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={spinnerLabel}
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-muted-foreground",
        className,
      )}
    >
      <div className="flex h-4 w-4 items-center justify-center">
        {showSpinner ? (
          <Loader2 className={cn("h-4 w-4 animate-spin", spinnerClassName)} />
        ) : (
          <span className="h-4 w-4" aria-hidden="true" />
        )}
      </div>
      {shouldShowHint ? (
        <p
          className={cn(
            "max-w-xs text-center text-xs duration-300 animate-in fade-in-0",
            hintClassName,
          )}
        >
          {hintText}
        </p>
      ) : null}
    </div>
  );
}
