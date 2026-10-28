import { useMemo } from "react";

import { buildGatewayAnalyticsQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/buildGatewayAnalyticsQuery";
import type { GatewayAnalyticsWidget } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { WidgetContent } from "@/src/features/widgets";
import { cn } from "@/src/utils/tailwind";

const SIZE_CLASSES: Record<GatewayAnalyticsWidget["size"], string> = {
  small: "h-40",
  medium: "h-96 lg:col-span-3",
  full: "h-96 lg:col-span-6",
};

export function GatewayAnalyticsWidgetCard({
  projectId,
  widget,
  timeRange,
  dimensionLabelMap,
}: {
  projectId: string;
  widget: GatewayAnalyticsWidget;
  timeRange: { from: Date; to: Date };
  dimensionLabelMap?: ReadonlyMap<string, string>;
}) {
  const query = useMemo(
    () => buildGatewayAnalyticsQuery(widget, timeRange),
    [widget, timeRange],
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
        projectId={projectId}
        query={query}
        version="v2"
        chartType={widget.chartConfig.type}
        chartConfig={widget.chartConfig}
        metrics={widget.metrics}
        dimensions={widget.dimensions}
        view={widget.view}
        schedulerId={`ai-gateway-analytics:${widget.id}`}
        layoutHint="compact"
        dimensionLabelMap={dimensionLabelMap}
      />
    </DashboardCard>
  );
}
