import { useMemo, useState } from "react";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { TimeRangePicker } from "@/src/components/date-picker";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ConnectedGatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/ConnectedGatewayNotSetUpNotice";
import { GatewayGuardrailsChart } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayGuardrailsChart/GatewayGuardrailsChart";
import { ConnectedGatewayGuardrailsTable } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayGuardrailsTable/ConnectedGatewayGuardrailsTable";
import { useGatewayGuardrailSelection } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/hooks/useGatewayGuardrailSelection";
import { useGatewayGuardrailsTableState } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/hooks/useGatewayGuardrailsTableState";
import { GATEWAY_ANALYTICS_TIME_RANGE_PRESETS } from "@/src/features/ai-gateway/constants/gatewayAnalyticsTimeRangePresets";
import type { GatewayGuardrailInterval } from "@/src/features/ai-gateway/constants/gatewayGuardrailTemplates";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

export type GatewayGuardrailsPageProps = {
  organizationId: string;
};

/**
 * Flagged gateway requests over time above a multi-select table of the
 * organization's guardrails. Organization OWNER and ADMIN manage guardrails;
 * everyone else gets a read-only view.
 */
export function GatewayGuardrailsPage({
  organizationId,
}: GatewayGuardrailsPageProps) {
  const { canManageGateway, isIngestionConfigured, isRecording } =
    useGatewaySettingsAccess(organizationId);
  const table = useGatewayGuardrailsTableState(organizationId);
  const guardrailSelection = useGatewayGuardrailSelection(
    organizationId,
    table,
  );
  const [interval, setInterval] = useState<GatewayGuardrailInterval>("day");
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
        {isRecording === false ? (
          <Banner title="Gateway requests aren’t recorded">
            {canManageGateway
              ? "Flagged request counts come from the traces the gateway writes to its ingestion project. Turn on usage or full ingestion on the Overview page to see counts here."
              : "Ask your organization admin to turn on usage or full ingestion for the AI Gateway to see flagged request counts here."}
          </Banner>
        ) : null}
        {isRecording === undefined ? (
          <Skeleton className="h-80 rounded-lg" />
        ) : null}
        {canQueryAnalytics ? (
          <GatewayGuardrailsChart
            organizationId={organizationId}
            timeRange={absoluteTimeRange}
            interval={interval}
            onIntervalChange={setInterval}
            selection={guardrailSelection.selection}
            tags={guardrailSelection.tags}
            onRemoveTag={guardrailSelection.removeTag}
          />
        ) : null}
        <ConnectedGatewayGuardrailsTable
          organizationId={organizationId}
          table={table}
        />
      </div>
    </>
  );
}
