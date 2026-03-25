import { QueryProgressBar } from "@/src/features/widgets/chart-library/QueryProgressBar";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { type QueryProgress } from "@/src/hooks/useSSEDashboardQuery";

const PROGRESS_DELAY_MS = 50;

export function EventsTableLoadingState({
  isLoading,
  progress,
}: {
  isLoading: boolean;
  progress: QueryProgress | null;
}) {
  const [showDelayedProgress, setShowDelayedProgress] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowDelayedProgress(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowDelayedProgress(true);
    }, PROGRESS_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isLoading]);

  if (!isLoading) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="text-muted-foreground flex w-full flex-col items-center justify-start text-center"
    >
      {showDelayedProgress && progress ? (
        <QueryProgressBar progress={progress} />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
    </div>
  );
}
