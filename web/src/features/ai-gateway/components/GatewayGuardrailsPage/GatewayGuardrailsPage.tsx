import { useMemo, useState } from "react";
import { LifeBuoy } from "@langfuse/icons";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { TimeRangePicker } from "@/src/components/date-picker";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  GatewayGuardrailDialogController,
  type GatewayGuardrailTemplateKind,
} from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/GatewayGuardrailDialogController";
import { ConnectedGatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/ConnectedGatewayNotSetUpNotice";
import { GatewayGuardrailsChart } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayGuardrailsChart/GatewayGuardrailsChart";
import { ConnectedGatewayGuardrailsTable } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayGuardrailsTable/ConnectedGatewayGuardrailsTable";
import { GatewayNoGuardrailsEmptyState } from "@/src/features/ai-gateway/components/GatewayGuardrailsPage/components/GatewayNoGuardrailsEmptyState/GatewayNoGuardrailsEmptyState";
import { GATEWAY_ANALYTICS_TIME_RANGE_PRESETS } from "@/src/features/ai-gateway/constants/gatewayAnalyticsTimeRangePresets";
import { GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import type { GatewayTimeSeriesInterval } from "@/src/features/ai-gateway/constants/gatewayTimeSeriesIntervals";
import { useGatewayGuardrailsTableState } from "@/src/features/ai-gateway/hooks/useGatewayGuardrailsTableState";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { useOpenGuardrailsLimitFeedback } from "@/src/features/ai-gateway/hooks/useOpenGuardrailsLimitFeedback";
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
  const {
    canManageGateway,
    isIngestionConfigured,
    isRecording,
    isSetupStatusPending,
  } = useGatewaySettingsAccess(organizationId);
  const openLimitFeedback = useOpenGuardrailsLimitFeedback();
  const table = useGatewayGuardrailsTableState(organizationId);
  const [interval, setInterval] = useState<GatewayTimeSeriesInterval>("day");
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );

  if (isSetupStatusPending) return <GuardrailsPageSkeleton />;

  if (!canManageGateway && isIngestionConfigured === false) {
    return <ConnectedGatewayNotSetUpNotice />;
  }

  if (table.guardrails.isPending) return <GuardrailsPageSkeleton />;

  if (table.guardrails.data?.organizationCount === 0) {
    if (!canManageGateway) {
      return <GatewayNoGuardrailsEmptyState mode="readOnly" />;
    }

    return (
      <GatewayGuardrailDialogController organizationId={organizationId}>
        {({ openDialog }) => {
          const handleAddGuardrail = () => openDialog({ mode: "create" });
          const handleSelectTemplate = (
            templateKind: GatewayGuardrailTemplateKind,
          ) => openDialog({ mode: "create", templateKind });

          return (
            <GatewayNoGuardrailsEmptyState
              mode="manage"
              onAddGuardrail={handleAddGuardrail}
              onSelectTemplate={handleSelectTemplate}
            />
          );
        }}
      </GatewayGuardrailDialogController>
    );
  }

  const canQueryAnalytics = isRecording === true && absoluteTimeRange !== null;
  const isAtGuardrailLimit =
    canManageGateway &&
    (table.guardrails.data?.organizationCount ?? 0) >=
      GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION;
  const notRecordingMessage = canManageGateway
    ? "Flagged request counts come from the traces the gateway writes to its ingestion project. Turn on usage or full ingestion on the Overview page to see counts here."
    : "Ask your organization admin to turn on usage or full ingestion for the AI Gateway to see flagged request counts here.";

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
        {isAtGuardrailLimit ? (
          <Banner
            variant="info"
            title={`You’ve reached the limit of ${GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION} guardrails`}
            actions={[
              {
                text: "Share feedback with support",
                icon: LifeBuoy,
                onClick: () => openLimitFeedback("count"),
              },
            ]}
          >
            Organizations can have up to{" "}
            {GATEWAY_GUARDRAIL_MAX_PER_ORGANIZATION} guardrails in place. Need
            more for your setup? Tell us what you’re building so we can learn
            from your use case and help.
          </Banner>
        ) : null}
        {isRecording === false ? (
          <Banner title="Gateway requests aren’t recorded">
            {notRecordingMessage}
          </Banner>
        ) : null}
        {isRecording === undefined ? (
          <Skeleton className="h-96 rounded-lg" />
        ) : null}
        {canQueryAnalytics ? (
          <GatewayGuardrailsChart
            organizationId={organizationId}
            timeRange={absoluteTimeRange}
            interval={interval}
            onIntervalChange={setInterval}
            table={table}
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

function GuardrailsPageSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-96 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}
