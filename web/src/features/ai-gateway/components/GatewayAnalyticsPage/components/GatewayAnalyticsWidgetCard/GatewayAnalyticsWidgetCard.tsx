import { useMemo } from "react";
import type { FilterState } from "@langfuse/shared";

import { buildGatewayAnalyticsQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/buildGatewayAnalyticsQuery";
import type { GatewayAnalyticsWidget } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { WidgetContent } from "@/src/features/widgets";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { cn } from "@/src/utils/tailwind";

const SIZE_CLASSES: Record<GatewayAnalyticsWidget["size"], string> = {
  small: "h-40",
  medium: "h-96 lg:col-span-3",
  full: "h-96 lg:col-span-6",
};

// A breakdown bar chart draws nothing but empty axes when there are no rows,
// unlike the time-series and number tiles that already fail into a "No data"
// card themselves. Hand it one explicitly. Stable node so the chart memo holds.
const NO_DATA_PLACEHOLDER = <NoDataOrLoading isLoading={false} />;

const BAR_CHART_TYPES = new Set<GatewayAnalyticsWidget["chartType"]>([
  "HORIZONTAL_BAR",
  "VERTICAL_BAR",
]);

export function GatewayAnalyticsWidgetCard({
  projectId,
  widget,
  timeRange,
  filters,
  dimensionLabelMap,
}: {
  projectId: string;
  widget: GatewayAnalyticsWidget;
  timeRange: { from: Date; to: Date };
  filters: FilterState;
  dimensionLabelMap?: ReadonlyMap<string, string>;
}) {
  const query = useMemo(
    () => buildGatewayAnalyticsQuery(widget, timeRange, filters),
    [widget, timeRange, filters],
  );

  return (
    <DashboardCard
      className={cn(
        // Series labels can be member names, emails and key notes.
        "ph-no-capture min-w-0 lg:col-span-2",
        SIZE_CLASSES[widget.size],
      )}
      title={widget.name}
      description={widget.description}
      // WidgetContent renders its own loading state.
      isLoading={false}
      cardContentClassName="min-h-0"
    >
      <WidgetContent
        // The loading skeleton has a min height taller than the small tiles;
        // clip it to the content area like dashboard widgets do.
        className="overflow-hidden"
        projectId={projectId}
        query={query}
        version="v2"
        chartType={widget.chartType}
        chartConfig={widget.chartConfig}
        metrics={widget.metrics}
        dimensions={widget.dimensions}
        view={widget.view}
        schedulerId={`ai-gateway-analytics:${widget.id}`}
        layoutHint="compact"
        dimensionLabelMap={dimensionLabelMap}
        emptyState={
          BAR_CHART_TYPES.has(widget.chartType)
            ? NO_DATA_PLACEHOLDER
            : undefined
        }
      />
    </DashboardCard>
  );
}
