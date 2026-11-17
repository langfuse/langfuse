import { SparklineChart } from "@/src/components/design-system/charts/SparklineChart/SparklineChart";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  prepareAgentActivity,
  type AgentActivityState,
} from "../lib/agentActivity";

export function AgentActivitySparkline({
  activity,
}: {
  activity: AgentActivityState;
}) {
  if (activity.status === "loading")
    return (
      <div className="flex h-14 flex-col gap-1.5" aria-label="Loading activity">
        <Skeleton className="h-3 w-24 self-end motion-reduce:animate-none" />
        <Skeleton className="h-9 w-full motion-reduce:animate-none" />
      </div>
    );
  if (activity.status === "error")
    return (
      <div className="text-muted-foreground flex h-14 items-center text-xs">
        Activity unavailable
      </div>
    );

  const prepared = prepareAgentActivity(activity.data);
  const total = prepared.total;
  return (
    <div className="ph-no-capture flex h-14 flex-col gap-1.5">
      <div className="text-muted-foreground text-right text-xs">
        <span className="tabular-nums">
          {total === null
            ? "Incomplete history"
            : `${total.toLocaleString()} observations`}
        </span>
      </div>
      <SparklineChart
        size="md"
        plot={prepared.plot}
        label={
          total === null
            ? "Some observations in this period are unavailable"
            : `${total.toLocaleString()} observations in the selected period`
        }
      />
    </div>
  );
}
