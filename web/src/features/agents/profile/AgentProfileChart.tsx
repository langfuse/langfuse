import { type AgentSessionProjection } from "@langfuse/shared";
import { MetricStripBand } from "@/src/components/metric-strip/MetricStripBand";
import { OutlierBarStrip } from "@/src/features/events/components/outlier-strip/OutlierBarStrip";
import { useElementSize } from "@/src/hooks/useElementSize";
import { type AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import {
  prepareAgentProfileChart,
  type AgentProfileTab,
} from "./prepareAgentProfile";

export function AgentProfileChart({
  projection,
  agentName,
  tab,
  onSelectRange,
}: {
  projection: AgentSessionProjection;
  agentName: string;
  tab: AgentProfileTab;
  onSelectRange: (range: AbsoluteTimeRange) => void;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const bucketMs = projection.activityBucketMs;
  const chart = prepareAgentProfileChart({
    activity: projection.activity,
    agentName,
    tab,
    window: projection.window,
    bucketMs,
    widthPx: Math.max(0, (size?.width ?? 0) - 16),
  });
  return (
    <MetricStripBand
      ref={ref}
      measured={Boolean(size)}
      status={projection.activity.length ? "ready" : "empty"}
      emptyMessage="No activity in this interval. Choose a wider range."
      header={
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
          <h2 className="text-sm font-bold">{chart.title}</h2>
          <span className="text-muted-foreground text-xs">
            Click or drag to zoom · Back restores the range · local time
          </span>
        </div>
      }
    >
      <OutlierBarStrip
        dense={chart.dense}
        maxValue={chart.maxValue}
        ticks={chart.ticks}
        metric="count"
        scale="linear"
        stepMs={bucketMs}
        widthPx={Math.max(0, (size?.width ?? 0) - 16)}
        heightPx={85}
        disabledReason={
          projection.coverage.rowsTruncated ||
          projection.coverage.sessionsTruncated
            ? "Activity coverage is partial. Choose a smaller interval to explore reliable buckets."
            : undefined
        }
        onSelectBucket={({ fromMs, toMs }) =>
          onSelectRange({
            from: new Date(Math.max(fromMs, projection.window.from.getTime())),
            to: new Date(Math.min(toMs, projection.window.to.getTime())),
          })
        }
      />
    </MetricStripBand>
  );
}
