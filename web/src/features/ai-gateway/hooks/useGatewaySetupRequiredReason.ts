import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

const GATEWAY_SETUP_REQUIRED_REASON =
  "Finish the gateway setup on Overview first.";

/**
 * Why gateway managers cannot open Models and Gateway keys yet; undefined once
 * the gateway is set up. Other members see a notice on those pages instead.
 */
export function useGatewaySetupRequiredReason(
  organizationId: string | undefined,
) {
  const access = useGatewaySettingsAccess(organizationId);
  const needsSetup =
    access.showNotDeployedNotice ||
    (access.showManagement && access.isIngestionConfigured === false);
  return needsSetup ? GATEWAY_SETUP_REQUIRED_REASON : undefined;
}
