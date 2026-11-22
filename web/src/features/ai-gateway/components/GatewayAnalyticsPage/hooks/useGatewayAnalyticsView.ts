import {
  type GatewayAnalyticsView,
  resolveGatewayAnalyticsView,
} from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/resolveGatewayAnalyticsView";
import { useGatewayAnalyticsLabels } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsLabels";
import { useHasGatewayUsageHistory } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useHasGatewayUsageHistory";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

/** What the Overview analytics show: a notice, an empty state, or the dashboard. */
export function useGatewayAnalyticsView(
  organizationId: string,
): GatewayAnalyticsView {
  const { isIngestionConfigured, isRecording, isSetupStatusPending } =
    useGatewaySettingsAccess(organizationId);
  const { hasGatewayKeys, isPending: isLabelsPending } =
    useGatewayAnalyticsLabels(organizationId);
  const hasUsageHistory = useHasGatewayUsageHistory({
    organizationId,
    enabled:
      isIngestionConfigured === true &&
      isRecording !== false &&
      hasGatewayKeys === false,
  });

  return resolveGatewayAnalyticsView({
    isIngestionConfigured,
    isRecording,
    isSetupStatusPending,
    isLabelsPending,
    hasGatewayKeys,
    hasUsageHistory,
  });
}
