import { useMemo } from "react";
import type { FilterState } from "@langfuse/shared";

import { GatewayUnpricedCostBadge } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayUnpricedCostBadge/GatewayUnpricedCostBadge";
import { GATEWAY_ANALYTICS_WIDGET_SIZE_CLASSES } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgetSizeClasses";
import { buildGatewayAnalyticsQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/buildGatewayAnalyticsQuery";
import type { GatewayUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/summarizeUnpricedUsage";
import type { GatewayAnalyticsWidget } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { WidgetContent } from "@/src/features/widgets";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";

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
  isWaitingForLabels = false,
  unpricedUsage,
}: {
  projectId: string;
  widget: GatewayAnalyticsWidget;
  timeRange: { from: Date; to: Date };
  filters: FilterState;
  dimensionLabelMap?: ReadonlyMap<string, string>;
  /** Covers the chart, which keeps loading underneath, so raw IDs never flash before their labels. */
  isWaitingForLabels?: boolean;
  /** Flags cost widgets whose totals exclude usage of models without a price. */
  unpricedUsage?: GatewayUnpricedUsage;
}) {
  const query = useMemo(
    () => buildGatewayAnalyticsQuery(widget, timeRange, filters),
    [widget, timeRange, filters],
  );
  const excludedUnpricedUsage = widget.metrics.some(
    ({ measure }) => measure === "totalCost",
  )
    ? unpricedUsage
    : undefined;

  return (
    <DashboardCard
      className={cn(
        // Series labels can be member names, emails and key notes.
        "ph-no-capture min-w-0",
        GATEWAY_ANALYTICS_WIDGET_SIZE_CLASSES[widget.size],
      )}
      title={
        excludedUnpricedUsage ? (
          // The title line is tall enough that the badge never reflows the card.
          <span className="flex items-center gap-2">
            {widget.name}
            <GatewayUnpricedCostBadge usage={excludedUnpricedUsage} />
          </span>
        ) : (
          widget.name
        )
      }
      description={widget.description}
      // WidgetContent renders its own loading state.
      isLoading={false}
      cardContentClassName="min-h-0"
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <WidgetContent
          // The loading skeleton has a min height taller than the small tiles;
          // clip it to the content area like dashboard widgets do.
          className={cn("overflow-hidden", isWaitingForLabels && "invisible")}
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
          usdPrecision="cents"
        />
        {isWaitingForLabels ? <Skeleton className="absolute inset-0" /> : null}
      </div>
    </DashboardCard>
  );
}
