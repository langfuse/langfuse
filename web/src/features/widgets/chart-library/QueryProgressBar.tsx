import { type QueryProgress } from "@/src/hooks/useSSEDashboardQuery";
import { cn } from "@/src/utils/tailwind";

function formatRows(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function QueryProgressBar({
  progress,
  className,
}: {
  progress: QueryProgress;
  className?: string;
}) {
  const percent = Math.min(progress.percent * 100, 100);

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div className="bg-muted h-1.5 w-32 overflow-hidden rounded-full">
        <div
          className="bg-primary/60 h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Reading {formatRows(progress.read_rows)} / ~
        {formatRows(progress.total_rows_to_read)} rows
      </p>
    </div>
  );
}
