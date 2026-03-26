import { type QueryProgress } from "@/src/hooks/useSSEDashboardQuery";
import { cn } from "@/src/utils/tailwind";

function formatRows(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

type QueryProgressBarProps = {
  progress?: QueryProgress | null;
  className?: string;
  layout?: "default" | "compact" | "tight";
};

export function QueryProgressBar({
  progress,
  className,
  layout = "default",
}: QueryProgressBarProps) {
  const hasProgress = progress != null;
  const percent = hasProgress
    ? Math.max(0, Math.min(progress.percent * 100, 100))
    : 0;
  const compactLayout = layout !== "default";
  const showProgressLabel = layout !== "tight";

  return (
    <div className={cn("w-full min-w-0", className)}>
      <div
        role="progressbar"
        aria-label="Query progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasProgress ? Math.round(percent) : undefined}
        className={cn(
          "bg-muted/80 overflow-hidden rounded-full",
          compactLayout ? "h-1.5" : "h-2",
        )}
      >
        {hasProgress ? (
          <div
            className="bg-primary/60 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        ) : null}
      </div>
      {showProgressLabel ? (
        <p
          className={cn(
            "text-muted-foreground mt-2 tabular-nums",
            compactLayout ? "text-[11px] leading-4" : "text-xs",
          )}
        >
          {hasProgress
            ? `Reading ${formatRows(progress.read_rows)} / ~${formatRows(
                progress.total_rows_to_read,
              )} rows`
            : "Reading query progress..."}
        </p>
      ) : null}
    </div>
  );
}
