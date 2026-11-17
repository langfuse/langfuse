import { type ComponentProps, useMemo, useState } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { TimeRangePicker } from "@/src/components/date-picker";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useGatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { ConnectedGatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/ConnectedGatewayNotSetUpNotice";
import { ConnectedGatewayApiKeysTable } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeysTable/ConnectedGatewayApiKeysTable";
import { GatewaySpendChart } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewaySpendChart/GatewaySpendChart";
import { ConnectedGatewayUserSpendTable } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayUserSpendTable/ConnectedGatewayUserSpendTable";
import type { GatewaySpendInterval } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendIntervals";
import { useGatewayBudgetsTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayBudgetsTab";
import { toGatewaySpendFilters } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/fns/toGatewaySpendFilters";
import { GATEWAY_ANALYTICS_TIME_RANGE_PRESETS } from "@/src/features/ai-gateway/constants/gatewayAnalyticsTimeRangePresets";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

type GatewayBudgetsPageProps = {
  organizationId: string;
};

const noKeysMessage = (
  <p className="text-muted-foreground text-sm">
    No gateway keys yet. Create one on the Gateway keys page.
  </p>
);

type ApiKeyRowClickHandler = NonNullable<
  ComponentProps<typeof ConnectedGatewayApiKeysTable>["onRowClick"]
>;
type UserRowClickHandler = NonNullable<
  ComponentProps<typeof ConnectedGatewayUserSpendTable>["onRowClick"]
>;

/**
 * Spend over time for the whole gateway, or for one key or user once its row
 * is selected. Managers see all usage; everyone else only their own, which
 * the server enforces. Managers are redirected to Setup until ingestion is
 * configured.
 */
export function GatewayBudgetsPage({
  organizationId,
}: GatewayBudgetsPageProps) {
  const { canManageGateway, isIngestionConfigured, isRecording } =
    useGatewaySettingsAccess(organizationId);
  const fetchQuery = useGatewayAnalyticsFetchQuery(organizationId);
  const { labels } = useGatewayAnalyticsLabels(organizationId);
  const tab = useGatewayBudgetsTab();
  // A selection belongs to the tab it was made on, so switching tabs shows the total.
  const [selected, setSelected] = useState<{
    tab: typeof tab;
    id: string;
  } | null>(null);
  const selectedId = selected?.tab === tab ? selected.id : null;
  const [spendInterval, setSpendInterval] =
    useState<GatewaySpendInterval>("day");
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const selection = useMemo(() => {
    if (selectedId === null) return null;
    return {
      label: labels[tab].get(selectedId) ?? selectedId,
      filters: toGatewaySpendFilters(tab, selectedId),
    };
  }, [labels, tab, selectedId]);

  const toggleSelection = (id: string) => {
    setSelected(selectedId === id ? null : { tab, id });
  };

  const handleApiKeyRowClick: ApiKeyRowClickHandler = (row) => {
    toggleSelection(row.apiKey.id);
  };

  const handleUserRowClick: UserRowClickHandler = (row) => {
    toggleSelection(row.id);
  };

  const handleClearSelection = () => {
    setSelected(null);
  };

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
          <Alert>
            <Alert.Title>Gateway requests aren’t recorded</Alert.Title>
            <Alert.Description>
              {canManageGateway
                ? "Spend is built from the traces the gateway writes to its ingestion project. Turn on usage or full ingestion on the Overview page to see spend here."
                : "Ask your organization admin to turn on usage or full ingestion for the AI Gateway to see your spend here."}
            </Alert.Description>
          </Alert>
        )}
        {isRecording === undefined && <Skeleton className="h-80 rounded-lg" />}
        {canQueryAnalytics && (
          <GatewaySpendChart
            fetchQuery={fetchQuery}
            timeRange={absoluteTimeRange}
            interval={spendInterval}
            onIntervalChange={setSpendInterval}
            selection={selection}
            onClearSelection={handleClearSelection}
          />
        )}
        {tab === "apiKeys" && (
          <ConnectedGatewayApiKeysTable
            organizationId={organizationId}
            description={null}
            emptyState={noKeysMessage}
            onRowClick={handleApiKeyRowClick}
            selectedRowId={selectedId}
          />
        )}
        {tab === "users" && canQueryAnalytics && (
          <ConnectedGatewayUserSpendTable
            organizationId={organizationId}
            fetchQuery={fetchQuery}
            timeRange={absoluteTimeRange}
            onRowClick={handleUserRowClick}
            selectedRowId={selectedId}
          />
        )}
      </div>
    </>
  );
}
