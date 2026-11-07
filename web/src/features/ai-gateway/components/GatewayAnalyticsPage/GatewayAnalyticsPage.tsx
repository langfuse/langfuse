import { useState } from "react";
import { ChartColumn } from "@langfuse/icons";

import { TimeRangePicker } from "@/src/components/date-picker";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayAnalyticsDashboard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsDashboard/GatewayAnalyticsDashboard";
import { GatewayAnalyticsNoKeysEmptyState } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsNoKeysEmptyState/GatewayAnalyticsNoKeysEmptyState";
import { GatewayAnalyticsHeader } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsHeader/GatewayAnalyticsHeader";
import { GATEWAY_ANALYTICS_WIDGET_SIZE_CLASSES } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgetSizeClasses";
import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { GATEWAY_FIRST_REQUEST_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/GatewayNotSetUpNotice";
import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import type { TimeRange } from "@/src/utils/date-range-utils";
import { cn } from "@/src/utils/tailwind";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";

const TIME_RANGE_PRESETS = [
  "last1Day",
  "last7Days",
  "last30Days",
  "last90Days",
  "last1Year",
] as const;

/**
 * Managers see all gateway usage; members see only their own, which the
 * server enforces. The settings route sends managers to Setup until ingestion
 * is configured.
 */
export function GatewayAnalyticsPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const {
    canManageGateway,
    isIngestionConfigured,
    isRecording,
    isSetupStatusPending,
  } = useGatewaySettingsAccess(organizationId);
  const { hasGatewayKeys } = useGatewayAnalyticsLabels(organizationId);
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });

  if (isIngestionConfigured === false) {
    return <GatewayNotSetUpNotice />;
  }
  if (isRecording === false) {
    return (
      <AnalyticsNotRecorded
        organizationId={organizationId}
        canManageGateway={canManageGateway}
      />
    );
  }
  if (isIngestionConfigured && hasGatewayKeys === false) {
    return (
      <GatewayAnalyticsNoKeysEmptyState
        gatewayKeysHref={buildGatewayPagePath(
          organizationId,
          GATEWAY_PAGE_SLUGS.apiKeys,
        )}
        docsHref={GATEWAY_FIRST_REQUEST_DOCS_URL}
      />
    );
  }
  return (
    <>
      {/* Rendered while the setup status loads too, so the header controls do not pop in. */}
      <PageHeaderControlsPortal>
        <TimeRangePicker
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          timeRangePresets={TIME_RANGE_PRESETS}
          className="my-0 max-w-full overflow-x-auto"
          triggerClassName="px-2"
        />
      </PageHeaderControlsPortal>
      {isSetupStatusPending ? (
        <AnalyticsSkeleton />
      ) : (
        <GatewayAnalyticsDashboard
          organizationId={organizationId}
          timeRange={timeRange}
          canManageGateway={canManageGateway}
        />
      )}
    </>
  );
}

function AnalyticsNotRecorded({
  organizationId,
  canManageGateway,
}: {
  organizationId: string;
  canManageGateway: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <GatewaySetupEmptyState
        icon={ChartColumn}
        title="Gateway requests are not recorded"
        description={
          canManageGateway
            ? "Analytics are built from the traces the gateway writes to its ingestion project. Turn on usage or full ingestion on the Models page to see cost and usage here."
            : "Ask your organization admin to turn on usage or full ingestion for the AI Gateway to see your cost and usage here."
        }
        actions={
          canManageGateway
            ? [
                {
                  type: "link",
                  label: "Open Models",
                  href: buildGatewayPagePath(
                    organizationId,
                    GATEWAY_PAGE_SLUGS.models,
                  ),
                },
              ]
            : undefined
        }
      />
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
