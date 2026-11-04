import { useState } from "react";
import { ChartColumn } from "@langfuse/icons";

import Header from "@/src/components/layouts/header";
import { TimeRangePicker } from "@/src/components/date-picker";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayAnalyticsDashboard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsDashboard/GatewayAnalyticsDashboard";
import { GatewayAnalyticsHeader } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsHeader/GatewayAnalyticsHeader";
import { GATEWAY_ANALYTICS_WIDGET_SIZE_CLASSES } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgetSizeClasses";
import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";
import { useGatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayConfig";
import { useLangfuseV4WriteMode } from "@/src/features/organizations/hooks";
import type { TimeRange } from "@/src/utils/date-range-utils";
import { cn } from "@/src/utils/tailwind";

const TIME_RANGE_PRESETS = [
  "last1Day",
  "last7Days",
  "last30Days",
  "last90Days",
  "last1Year",
] as const;

/** Managers only; the settings route sends them to Setup until ingestion is configured. */
export function GatewayAnalyticsPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const configState = useGatewayConfig(organizationId);
  const v4WriteMode = useLangfuseV4WriteMode();
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });

  // Widgets run v2 queries, which legacy write mode does not serve.
  if (v4WriteMode === "legacy") {
    return <AnalyticsNeedEvents />;
  }
  if (configState.status === "error") {
    return <AnalyticsLoadError retry={configState.retry} />;
  }

  const project =
    configState.status === "success"
      ? configState.config?.defaultIngestionProject
      : undefined;
  if (
    configState.status === "success" &&
    (configState.config?.ingestionMode === "NONE" ||
      !project ||
      project.deletedAt)
  ) {
    return <AnalyticsUnavailable organizationId={organizationId} />;
  }
  return (
    <>
      {/* Rendered while the config loads too, so the header controls do not pop in. */}
      <PageHeaderControlsPortal>
        <TimeRangePicker
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          timeRangePresets={TIME_RANGE_PRESETS}
          className="my-0 max-w-full overflow-x-auto"
          triggerClassName="px-2"
        />
      </PageHeaderControlsPortal>
      {project ? (
        <GatewayAnalyticsDashboard
          organizationId={organizationId}
          projectId={project.id}
          timeRange={timeRange}
        />
      ) : (
        <AnalyticsSkeleton />
      )}
    </>
  );
}

function AnalyticsUnavailable({ organizationId }: { organizationId: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway analytics" />
      <GatewaySetupEmptyState
        icon={ChartColumn}
        title="Gateway requests are not recorded"
        description="Analytics are built from the traces the gateway writes to its ingestion project. Turn on usage or full ingestion in Setup to see cost and usage here."
        actions={[
          {
            type: "link",
            label: "Open Setup",
            href: `/organization/${organizationId}/settings/ai-gateway`,
          },
        ]}
      />
    </div>
  );
}

function AnalyticsNeedEvents() {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway analytics" />
      <GatewaySetupEmptyState
        icon={ChartColumn}
        title="Analytics are not available on this deployment"
        description="Gateway analytics read from the events tables, which are not written while LANGFUSE_MIGRATION_V4_WRITE_MODE is legacy."
      />
    </div>
  );
}

function AnalyticsLoadError({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway analytics" />
      <Alert variant="destructive">
        <Alert.Title>Gateway configuration could not be loaded</Alert.Title>
        <Alert.Description>
          Analytics need the gateway&apos;s ingestion project.
        </Alert.Description>
      </Alert>
      <div>
        <Button text="Retry" variant="secondary" onClick={retry} />
      </div>
    </div>
  );
}

/** Mirrors the dashboard's header, filters and widget grid so nothing moves when it loads. */
function AnalyticsSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="gateway-analytics-loading"
    >
      <GatewayAnalyticsHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </GatewayAnalyticsHeader>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
        {GATEWAY_ANALYTICS_WIDGETS.map((widget) => (
          <Skeleton
            key={widget.id}
            className={cn(
              "rounded-lg",
              GATEWAY_ANALYTICS_WIDGET_SIZE_CLASSES[widget.size],
            )}
          />
        ))}
      </div>
    </div>
  );
}
