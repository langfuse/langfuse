import { useState } from "react";
import { ChartColumn } from "@langfuse/icons";

import { TimeRangePicker } from "@/src/components/date-picker";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayAnalyticsDashboard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsDashboard/GatewayAnalyticsDashboard";
import { GatewayAnalyticsNoKeysEmptyState } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsNoKeysEmptyState/GatewayAnalyticsNoKeysEmptyState";
import { GATEWAY_ANALYTICS_WIDGET_SIZE_CLASSES } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgetSizeClasses";
import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { useGatewayAnalyticsView } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsView";
import { GATEWAY_FIRST_REQUEST_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/GatewayNotSetUpNotice";
import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import type { TimeRange } from "@/src/utils/date-range-utils";
import { cn } from "@/src/utils/tailwind";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { getGatewaySetupHeroProviders } from "@/src/features/ai-gateway/components/GatewayOverviewPage/fns/getGatewaySetupHeroProviders";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { api } from "@/src/utils/api";

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
  const { canManageGateway } = useGatewaySettingsAccess(organizationId);
  const view = useGatewayAnalyticsView(organizationId);
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });

  if (view === "notSetUp") return <GatewayNotSetUpNotice />;
  if (view === "notRecorded") {
    return <AnalyticsNotRecorded canManageGateway={canManageGateway} />;
  }
  if (view === "noKeys") {
    return <NoKeysEmptyState organizationId={organizationId} />;
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
      {view === "loading" ? (
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

function NoKeysEmptyState({ organizationId }: { organizationId: string }) {
  const connectionsQuery = api.aiGateway.listModelConnections.useQuery({
    orgId: organizationId,
  });
  const connectedProviders = new Set<GatewayProvider>(
    (connectionsQuery.data ?? []).map(({ provider }) => provider),
  );

  return (
    <GatewayAnalyticsNoKeysEmptyState
      gatewayKeysHref={buildGatewayPagePath(
        organizationId,
        GATEWAY_PAGE_SLUGS.apiKeys,
      )}
      docsHref={GATEWAY_FIRST_REQUEST_DOCS_URL}
      providers={getGatewaySetupHeroProviders(connectedProviders)}
    />
  );
}

function AnalyticsNotRecorded({
  canManageGateway,
}: {
  canManageGateway: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <GatewaySetupEmptyState
        icon={ChartColumn}
        title="Gateway requests are not recorded"
        description={
          canManageGateway
            ? "Analytics are built from the traces the gateway writes to its ingestion project. Turn on usage or full ingestion with the Ingestion button at the top right to see cost and usage here."
            : "Ask your organization admin to turn on usage or full ingestion for the AI Gateway to see your cost and usage here."
        }
      />
    </div>
  );
}

/** Mirrors the dashboard's widget grid so nothing moves when it loads. */
function AnalyticsSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="gateway-analytics-loading"
    >
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
