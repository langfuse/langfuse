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
import { useGatewaySpendFilterOptions } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewaySpendFilterOptions";
import { GATEWAY_SPEND_TABS } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import type { GatewaySpendInterval } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendIntervals";
import { useGatewayBudgetsTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayBudgetsTab";
import { toGatewaySpendFilters } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/fns/toGatewaySpendFilters";
import { GATEWAY_ANALYTICS_TIME_RANGE_PRESETS } from "@/src/features/ai-gateway/constants/gatewayAnalyticsTimeRangePresets";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

const SUBJECT_FILTER_COPY = {
  users: {
    placeholder: "All users",
    searchPlaceholder: "Search users...",
    emptyMessage: "No user found.",
  },
  apiKeys: {
    placeholder: "All keys",
    searchPlaceholder: "Search keys...",
    emptyMessage: "No key found.",
  },
} as const;

const NO_SUBJECTS: GatewaySpendSubject[] = [];

type GatewayBudgetsPageProps = {
  organizationId: string;
};

/**
 * Spend over time for the whole gateway, or for the keys or users picked in
 * the chart or by clicking their rows. Managers see all usage; everyone else
 * only their own, which the server enforces. Managers are redirected to Setup
 * until ingestion is configured.
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
    subjects: GatewaySpendSubject[];
  } | null>(null);
  const selectedSubjects =
    selected?.tab === tab ? selected.subjects : NO_SUBJECTS;
  const listedOptions = useGatewaySpendFilterOptions(organizationId, tab);
  const [spendInterval, setSpendInterval] =
    useState<GatewaySpendInterval>("day");
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const selectedIds = useMemo(
    () => selectedSubjects.map(({ value }) => value),
    [selectedSubjects],
  );
  const filters = useMemo(
    () => toGatewaySpendFilters(tab, selectedIds),
    [tab, selectedIds],
  );
  // Selected subjects stay pickable even when they are outside the listed options.
  const options = mergeOptions(selectedSubjects, listedOptions);

  const handleRowClick = (row: GatewayBudgetRow) => {
    const isSelected = selectedIds.includes(row.subjectId);
    setSelected({
      tab,
      subjects: isSelected
        ? selectedSubjects.filter(({ value }) => value !== row.subjectId)
        : [...selectedSubjects, { value: row.subjectId, label: row.name }],
    });
  };

  const handleSubjectsChange = (ids: string[]) => {
    const byId = new Map(options.map((option) => [option.value, option]));
    setSelected({
      tab,
      subjects: ids.flatMap((id) => {
        const option = byId.get(id);
        return option ? [option] : [];
      }),
    });
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
            subjectFilter={{
              ...SUBJECT_FILTER_COPY[tab],
              label: GATEWAY_SPEND_TABS[tab].label,
              value: selectedIds,
              options,
              onValueChange: handleSubjectsChange,
              filters,
            }}
          />
        )}
        <ConnectedGatewayBudgetsTable
          key={tab}
          organizationId={organizationId}
          tab={tab}
          onRowClick={handleRowClick}
        />
      </div>
    </>
  );
}

function mergeOptions(
  selected: GatewaySpendSubject[],
  listed: GatewaySpendSubject[],
) {
  const selectedIds = new Set(selected.map(({ value }) => value));
  return [
    ...selected,
    ...listed.filter(({ value }) => !selectedIds.has(value)),
  ];
}

type GatewaySpendSubject = { value: string; label: string };
