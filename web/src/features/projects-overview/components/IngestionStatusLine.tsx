import { cva } from "class-variance-authority";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type IngestionStatus } from "@/src/features/projects-overview/fns/projectsOverview/getIngestionStatus";
import { formatCompactRelativeTime } from "@/src/utils/dates";

const dotVariants = cva("inline-flex size-2 shrink-0 rounded-full", {
  variants: {
    tone: {
      live: "bg-dark-green",
      quiet: "bg-dark-yellow",
      stale: "bg-dark-red",
      inactive: "bg-muted-foreground/50",
      "not-set-up": "border-muted-foreground/60 border bg-transparent",
    },
  },
});

const labels: Record<
  Exclude<IngestionStatus["kind"], "checking">,
  { title: string }
> = {
  live: { title: "Receiving data" },
  quiet: { title: "Quiet" },
  stale: { title: "Stale" },
  inactive: { title: "No traces in the last 30 days" },
  "not-set-up": { title: "No data received yet" },
};

/** Whether the project is receiving data, as one short line with a status dot. */
export function IngestionStatusLine({
  status,
  isUnavailable,
}: {
  status: IngestionStatus;
  /** The organization's read failed, so only what the session knows is shown. */
  isUnavailable: boolean;
}) {
  if (status.kind === "checking") {
    return isUnavailable ? (
      <p className="text-muted-foreground text-xs">Activity unavailable</p>
    ) : (
      <Skeleton className="h-3.5 w-36" />
    );
  }

  const { title } = labels[status.kind];
  const detail =
    "lastTraceAt" in status
      ? `last trace ${formatCompactRelativeTime(status.lastTraceAt)}`
      : null;

  return (
    <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
      <span aria-hidden="true" className={dotVariants({ tone: status.kind })} />
      <span className="text-foreground-secondary">{title}</span>
      {detail ? (
        <span className="truncate" title={detail}>
          · {detail}
        </span>
      ) : null}
    </p>
  );
}
