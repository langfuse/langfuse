import { useEffect, useState } from "react";
import { type QueryProgress } from "@/src/hooks/useSSEDashboardQuery";
import { cn } from "@/src/utils/tailwind";
import { QueryProgressBar } from "@/src/features/widgets/chart-library/QueryProgressBar";

const DEFAULT_HINT_DELAY_MS = 3000;
const DEFAULT_RECOMMENDATION_TEXT =
  "Try reducing the time range or adding more filters.";
const COMPACT_RECOMMENDATION_TEXT = "Add filters or reduce range.";

type QueryStatusFooterProps = {
  isLoading: boolean;
  progress?: QueryProgress | null;
  className?: string;
  hintDelayMs?: number;
  layout?: "default" | "compact" | "tight";
  hintText?: string;
};

export function QueryStatusFooter({
  isLoading,
  progress,
  className,
  hintDelayMs = DEFAULT_HINT_DELAY_MS,
  layout = "default",
  hintText,
}: QueryStatusFooterProps) {
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

  const isTight = layout === "tight";
  const isCompact = layout !== "default";
  const recommendationText =
    hintText ??
    (isCompact ? COMPACT_RECOMMENDATION_TEXT : DEFAULT_RECOMMENDATION_TEXT);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "border-border/50 border-t px-4 py-3",
        isTight ? "space-y-1.5" : "space-y-2",
        className,
      )}
    >
      <p
        className={cn(
          "text-foreground/90 font-medium",
          isCompact ? "text-xs" : "text-sm",
        )}
      >
        Running query...
      </p>

      <QueryProgressBar progress={progress} layout={layout} />

      <p
        className={cn(
          "text-muted-foreground min-h-[1rem]",
          isCompact ? "text-[11px] leading-4" : "text-xs leading-5",
        )}
      >
        {showHint ? recommendationText : <span aria-hidden="true">&nbsp;</span>}
      </p>
    </div>
  );
}
