import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { useGatewayKeyReminder } from "@/src/features/ai-gateway/hooks/useGatewayKeyReminder";
import { type AiGatewayPageSlug } from "@/src/features/ai-gateway/fns/gatewayUrls/aiGatewayPath";

const GATEWAY_SETUP_REQUIRED_REASON =
  "Set up an ingestion project in Setup first.";

/**
 * Which AI Gateway pages a member sees, without loading the pages themselves,
 * so navigation entries can link to the gateway cheaply.
 */
export function useAiGatewayPageVisibility(organizationId: string | undefined) {
  const gatewayAccess = useGatewaySettingsAccess(organizationId);
  const keyReminder = useGatewayKeyReminder(organizationId);
  const canReadSettings = useHasOrganizationAccess({
    organizationId,
    scope: "organizationSettings:read",
  });

  /** Gateway-only members; members with settings access keep the full analytics. */
  const showOwnUsageAnalytics =
    gatewayAccess.showApiKeys &&
    !gatewayAccess.showManagement &&
    !canReadSettings;

  const show: Record<AiGatewayPageSlug, boolean> = {
    setup: gatewayAccess.showManagement || gatewayAccess.showNotDeployedNotice,
    models: gatewayAccess.showModels,
    keys: gatewayAccess.showApiKeys,
    analytics: gatewayAccess.showManagement || showOwnUsageAnalytics,
  };

  return {
    show,
    firstVisibleSlug: (Object.keys(show) as AiGatewayPageSlug[]).find(
      (slug) => show[slug],
    ),
    showNotDeployedNotice: gatewayAccess.showNotDeployedNotice,
    keyReminder,
    /** Only managers get disabled entries; others see a notice on the page. */
    setupDisabledReason:
      gatewayAccess.showManagement &&
      gatewayAccess.isIngestionConfigured === false
        ? GATEWAY_SETUP_REQUIRED_REASON
        : undefined,
  };
}
