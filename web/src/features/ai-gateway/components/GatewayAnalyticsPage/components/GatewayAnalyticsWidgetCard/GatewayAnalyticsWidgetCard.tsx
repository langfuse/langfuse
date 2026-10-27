import { useMemo } from "react";

import { Card } from "@/src/components/ui/card";
import { buildGatewayAnalyticsQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/buildGatewayAnalyticsQuery";
import type { GatewayAnalyticsWidget } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";
import { WidgetContent } from "@/src/features/widgets";
import { cn } from "@/src/utils/tailwind";

const SIZE_CLASSES: Record<GatewayAnalyticsWidget["size"], string> = {
  small: "h-32",
  medium: "h-80 lg:col-span-3",
  full: "h-80 lg:col-span-6",
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
    <Card
      className={cn(
        // Series labels can be member names, emails and key notes.
        "ph-no-capture flex min-w-0 flex-col gap-2 p-3 lg:col-span-2",
        SIZE_CLASSES[widget.size],
      )}
    >
      <div className="min-w-0">
        <h3 className="truncate text-sm font-bold" title={widget.name}>
          {widget.name}
        </h3>
        <p
          className="text-muted-foreground truncate text-xs"
          title={widget.description}
        >
          {widget.description}
        </p>
      </div>
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
    </Card>
  );
}
