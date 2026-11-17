import { useId, useState } from "react";
import { format } from "date-fns";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import {
  MetricStripBand,
  MetricStripHeaderRow,
  MetricStripMessage,
  type MetricStripStatus,
} from "@/src/components/metric-strip/MetricStripBand";
import {
  OutlierBarStrip,
  type OutlierStripDrillTrigger,
} from "@/src/features/events/components/outlier-strip/OutlierBarStrip";
import {
  outlierStripResultColumn,
  prepareOutlierSeries,
} from "@/src/features/events/components/outlier-strip/lib/binning";
import { useElementSize } from "@/src/hooks/useElementSize";
import {
  prepareAgentActivity,
  selectAgentActivityRange,
  type AgentActivityState,
} from "../lib/agentActivity";

export function AgentActivityPulse({
  activity,
  label,
  description,
  onSelectRange,
}: {
  activity: AgentActivityState;
  label: string;
  description: string;
  onSelectRange: (
    range: { from: Date; to: Date },
    meta: {
      trigger: OutlierStripDrillTrigger;
      stepSeconds: number;
      spanBuckets: number;
    },
  ) => void;
}) {
  const descriptionId = useId();
  const [wrapperRef, size] = useElementSize<HTMLDivElement>();
  const [dragSelection, setDragSelection] = useState<{
    fromMs: number;
    toMs: number;
    windowKey: string;
  } | null>(null);
  // Band padding, a fixed y-label gutter, and the trailing chart inset.
  const plotWidth = Math.max((size?.width ?? 0) - 72, 1);
  const data = activity.status === "success" ? activity.data : null;
  const prepared = data ? prepareAgentActivity(data) : null;
  const windowKey = data
    ? `${data.from.getTime()}:${data.to.getTime()}:${data.bucketMs}`
    : "";
  const selection =
    dragSelection?.windowKey === windowKey ? dragSelection : null;
  const status = metricStripStatus(activity, prepared?.total);

  const series =
    data && prepared && prepared.total !== null
      ? prepareOutlierSeries({
          bins: prepared.values.map((value, index) => ({
            bucketStart: new Date(data.from.getTime() + index * data.bucketMs),
            count: value ?? 0,
            values: { [outlierStripResultColumn("count", "count")]: value },
          })),
          fromMs: data.from.getTime(),
          toMs: data.to.getTime(),
          stepSeconds: data.bucketMs / 1000,
          metric: "count",
          widthPx: plotWidth,
          formatTimestamp: (timestamp) =>
            format(
              timestamp,
              data.to.getTime() - data.from.getTime() >= 2 * 86_400_000
                ? "MMM d"
                : "HH:mm",
            ),
        })
      : null;

  return (
    <section
      className="ph-no-capture shrink-0"
      aria-label={label}
      aria-describedby={descriptionId}
    >
      <p id={descriptionId} className="sr-only">
        {description}
      </p>
      <MetricStripBand
        ref={wrapperRef}
        measured={size !== undefined}
        status={status}
        emptyMessage="No activity in the selected period"
        contentHeightClass="h-22.25"
        header={
          data && prepared?.total !== null ? (
            <div className="pt-0.5 pr-2 pl-1">
              <MetricStripHeaderRow>
                <Tooltip label={description}>
                  {({ getTriggerProps }) => (
                    <span
                      {...getTriggerProps()}
                      tabIndex={0}
                      className="text-xs font-bold"
                    >
                      {label}
                    </span>
                  )}
                </Tooltip>
              </MetricStripHeaderRow>
            </div>
          ) : undefined
        }
      >
        {data && series && prepared?.total !== null ? (
          <OutlierBarStrip
            className="mt-2 mr-2 ml-12"
            dense={series.dense}
            maxValue={series.maxValue}
            ticks={series.ticks}
            stepMs={data.bucketMs}
            metric="count"
            widthPx={plotWidth}
            selection={selection}
            onSelectionChange={(range) =>
              setDragSelection(range ? { ...range, windowKey } : null)
            }
            onSelectBucket={(range, meta) => {
              const selected = selectAgentActivityRange(range, data);
              if (selected) {
                onSelectRange(selected, {
                  trigger: meta.trigger,
                  stepSeconds: data.bucketMs / 1000,
                  spanBuckets: Math.ceil(
                    (selected.to.getTime() - selected.from.getTime()) /
                      data.bucketMs,
                  ),
                });
              }
            }}
          />
        ) : (
          <div className="h-22.25">
            <MetricStripMessage message="Activity unavailable" />
          </div>
        )}
      </MetricStripBand>
    </section>
  );
}

function metricStripStatus(
  activity: AgentActivityState,
  total: number | null | undefined,
): MetricStripStatus {
  if (activity.status === "loading") return "loading";
  if (total === 0) return "empty";
  return "ready";
}
