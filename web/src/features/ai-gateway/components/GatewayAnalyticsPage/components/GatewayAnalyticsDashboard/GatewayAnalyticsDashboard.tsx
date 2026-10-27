import { useMemo, useState } from "react";

import { TimeRangePicker } from "@/src/components/date-picker";
import Header from "@/src/components/layouts/header";
import { GatewayAnalyticsWidgetCard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsWidgetCard/GatewayAnalyticsWidgetCard";
import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

const TIME_RANGE_PRESETS = [
  "last1Day",
  "last7Days",
  "last30Days",
  "last90Days",
  "last1Year",
] as const;

export function GatewayAnalyticsDashboard({
  organizationId,
  projectId,
}: {
  organizationId: string;
  projectId: string;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const labels = useGatewayAnalyticsLabels(organizationId);

  return (
    <div className="flex flex-col gap-4">
      <Header
        title="Gateway analytics"
        help={{
          description:
            "Cost and usage of requests made through the AI Gateway, read from its ingestion project.",
        }}
        actionButtons={
          <TimeRangePicker
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            timeRangePresets={TIME_RANGE_PRESETS}
          />
        }
      />
      {absoluteTimeRange ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          {GATEWAY_ANALYTICS_WIDGETS.map((widget) => (
            <GatewayAnalyticsWidgetCard
              key={widget.id}
              projectId={projectId}
              widget={widget}
              timeRange={absoluteTimeRange}
              dimensionLabelMap={
                widget.dimensionLabels
                  ? labels[widget.dimensionLabels]
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
