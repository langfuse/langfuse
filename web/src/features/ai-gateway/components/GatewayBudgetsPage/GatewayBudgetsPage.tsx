import { useMemo, useState } from "react";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { TimeRangePicker } from "@/src/components/date-picker";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useGatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import { ConnectedGatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/ConnectedGatewayNotSetUpNotice";
import type { GatewaySpendInterval } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendIntervals";
import { GatewayBudgetsTabContent } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTabContent/GatewayBudgetsTabContent";
import { useGatewayBudgetsTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayBudgetsTab";
import { GATEWAY_ANALYTICS_TIME_RANGE_PRESETS } from "@/src/features/ai-gateway/constants/gatewayAnalyticsTimeRangePresets";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

type GatewayBudgetsPageProps = {
  organizationId: string;
};

/**
 * Spend over time for the whole gateway, or broken down by the keys or users
 * selected in the table. Managers see all usage; everyone else
 * only their own, which the server enforces. Managers are redirected to Setup
 * until ingestion is configured.
 */
export function GatewayBudgetsPage({
  organizationId,
}: GatewayBudgetsPageProps) {
  const { canManageGateway, isIngestionConfigured, isRecording } =
    useGatewaySettingsAccess(organizationId);
  const fetchQuery = useGatewayAnalyticsFetchQuery(organizationId);
  const tab = useGatewayBudgetsTab(canManageGateway);
  const [spendInterval, setSpendInterval] =
    useState<GatewaySpendInterval>("day");
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  if (!canManageGateway && isIngestionConfigured === false) {
    return <ConnectedGatewayNotSetUpNotice />;
  }

  const canQueryAnalytics = isRecording === true && absoluteTimeRange !== null;

  return (
    <>
      <PageHeaderControlsPortal>
        <TimeRangePicker
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          timeRangePresets={GATEWAY_ANALYTICS_TIME_RANGE_PRESETS}
          className="my-0 max-w-full overflow-x-auto"
          triggerClassName="px-2"
        />
      </PageHeaderControlsPortal>
      <div className="flex flex-col gap-2">
        {isRecording === false && (
          <Banner title="Gateway requests aren’t recorded">
            {canManageGateway
              ? "Spend is built from the traces the gateway writes to its ingestion project. Turn on usage or full ingestion on the Overview page to see spend here."
              : "Ask your organization admin to turn on usage or full ingestion for the AI Gateway to see your spend here."}
          </Banner>
        )}
        {isRecording === undefined && <Skeleton className="h-80 rounded-lg" />}
        <GatewayBudgetsTabContent
          key={tab}
          organizationId={organizationId}
          tab={tab}
          chart={
            canQueryAnalytics
              ? {
                  fetchQuery,
                  timeRange: absoluteTimeRange,
                  interval: spendInterval,
                  onIntervalChange: setSpendInterval,
                }
              : null
          }
        />
      </div>
    </>
  );
}
