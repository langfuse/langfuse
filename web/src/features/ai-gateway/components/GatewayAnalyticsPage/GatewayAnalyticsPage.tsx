import { useState } from "react";
import { BookOpen } from "@langfuse/icons";

import { TimeRangePicker } from "@/src/components/date-picker";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayAnalyticsDashboard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsDashboard/GatewayAnalyticsDashboard";
import { GatewayAnalyticsNoKeysEmptyState } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsNoKeysEmptyState/GatewayAnalyticsNoKeysEmptyState";
import { GATEWAY_ANALYTICS_WIDGET_SIZE_CLASSES } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgetSizeClasses";
import { GATEWAY_ANALYTICS_WIDGETS } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import { useGatewayAnalyticsView } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsView";
import {
  GATEWAY_ANALYTICS_DOCS_URL,
  GATEWAY_FIRST_REQUEST_DOCS_URL,
} from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { CreateGatewayApiKeyDialogController } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/CreateGatewayApiKeyDialogController";
import { ConnectedGatewayCreateFirstKeyPlaceholder } from "@/src/features/ai-gateway/components/GatewayCreateFirstKeyPlaceholder/ConnectedGatewayCreateFirstKeyPlaceholder";
import { ConnectedGatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/ConnectedGatewayNotSetUpNotice";
import { Button } from "@/src/components/design-system/Button/Button";
import { GatewayIdleDiagram } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayIdleDiagram";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import type { TimeRange } from "@/src/utils/date-range-utils";
import { cn } from "@/src/utils/tailwind";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { getGatewaySetupHeroProviders } from "@/src/features/ai-gateway/components/GatewayOverviewPage/fns/getGatewaySetupHeroProviders";
import { useGatewayModelConnections } from "@/src/features/ai-gateway/hooks/useGatewayModelConnections";

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
  // Above the view switch, so the new key's dialog stays open when the view changes.
  return (
    <CreateGatewayApiKeyDialogController organizationId={organizationId}>
      {({ openDialog }) => (
        <GatewayAnalyticsContent
          organizationId={organizationId}
          onCreateKey={openDialog}
        />
      )}
    </CreateGatewayApiKeyDialogController>
  );
}

function GatewayAnalyticsContent({
  organizationId,
  onCreateKey,
}: {
  organizationId: string;
  onCreateKey: () => void;
}) {
  const { canManageGateway } = useGatewaySettingsAccess(organizationId);
  const view = useGatewayAnalyticsView(organizationId);
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });

  if (view === "notSetUp") return <ConnectedGatewayNotSetUpNotice />;
  if (view === "notRecorded") {
    return (
      <AnalyticsNotRecorded
        organizationId={organizationId}
        canManageGateway={canManageGateway}
      />
    );
  }
  if (view === "noKeys") {
    return canManageGateway ? (
      <NoKeysEmptyState organizationId={organizationId} />
    ) : (
      <ConnectedGatewayCreateFirstKeyPlaceholder
        organizationId={organizationId}
        onCreateKey={onCreateKey}
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
  const { connectedProviders } = useGatewayModelConnections(organizationId);

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
  organizationId,
  canManageGateway,
}: {
  organizationId: string;
  canManageGateway: boolean;
}) {
  const { connectedProviders } = useGatewayModelConnections(organizationId);

  return (
    <GatewayPlaceholder.Frame
      title="Gateway requests aren’t recorded"
      description={
        canManageGateway
          ? "Analytics are built from the traces the gateway writes to its ingestion project. Turn on usage or full ingestion with the Ingestion button at the top right to see cost and usage here."
          : "Ask your organization admin to turn on usage or full ingestion for the AI Gateway to see your cost and usage here."
      }
    >
      <Button
        variant="outline"
        text="How gateway analytics work"
        icon={BookOpen}
        href={GATEWAY_ANALYTICS_DOCS_URL}
      />
      <GatewayIdleDiagram
        providers={getGatewaySetupHeroProviders(connectedProviders)}
        label="Not recorded"
      />
    </GatewayPlaceholder.Frame>
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
