import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

export type GatewayAnalyticsView =
  | "notSetUp"
  | "notRecorded"
  | "noKeys"
  | "loading"
  | "dashboard";

/** What the Overview analytics show: a notice, an empty state, or the dashboard. */
export function useGatewayAnalyticsView(
  organizationId: string,
): GatewayAnalyticsView {
  const { isIngestionConfigured, isRecording, isSetupStatusPending } =
    useGatewaySettingsAccess(organizationId);
  const { hasGatewayKeys } = useGatewayAnalyticsLabels(organizationId);

  if (isIngestionConfigured === false) return "notSetUp";
  if (isRecording === false) return "notRecorded";
  if (isIngestionConfigured && hasGatewayKeys === false) return "noKeys";
  return isSetupStatusPending ? "loading" : "dashboard";
}
