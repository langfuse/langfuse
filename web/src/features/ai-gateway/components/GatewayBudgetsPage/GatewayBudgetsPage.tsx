import { useMemo, useState } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { TimeRangePicker } from "@/src/components/date-picker";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useGatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import { ConnectedGatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/ConnectedGatewayNotSetUpNotice";
import { GatewaySpendChart } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewaySpendChart/GatewaySpendChart";
import { ConnectedGatewayBudgetsTable } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTable/ConnectedGatewayBudgetsTable";
import type { GatewayBudgetRow } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/components/GatewayBudgetsTable/GatewayBudgetsTable";
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
  const tab = useGatewayBudgetsTab();
  // A selection belongs to the tab it was made on, so switching tabs shows the total.
  const [selected, setSelected] = useState<{
    tab: typeof tab;
    row: GatewayBudgetRow;
  } | null>(null);
  const selectedRow = selected?.tab === tab ? selected.row : null;
  const [spendInterval, setSpendInterval] =
    useState<GatewaySpendInterval>("day");
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const selection = useMemo(
    () =>
      selectedRow
        ? {
            label: selectedRow.name,
            filters: toGatewaySpendFilters(tab, selectedRow.subjectId),
          }
        : null,
    [tab, selectedRow],
  );

  const handleRowClick = (row: GatewayBudgetRow) => {
    setSelected(selectedRow?.id === row.id ? null : { tab, row });
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
        <ConnectedGatewayBudgetsTable
          key={tab}
          organizationId={organizationId}
          tab={tab}
          selectedRowId={selectedRow?.id ?? null}
          onRowClick={handleRowClick}
        />
      </div>
    </>
  );
}
