import { useSession } from "next-auth/react";

import { gatewayPageAccess } from "@/src/features/ai-gateway/fns/gatewayPageAccess";
import { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";

/**
 * Single source for who sees which gateway settings and whether setup is done.
 * `isIngestionConfigured` stays undefined while loading so callers never gate
 * on a status they have not received yet.
 */
export function useGatewaySettingsAccess(organizationId: string | undefined) {
  const canManageGateway = useHasOrganizationAccess({
    organizationId,
    scope: "gateway:manage",
  });
  const canReadGateway = useHasOrganizationAccess({
    organizationId,
    scope: "gateway:read",
  });
  const canInvokeGateway = useHasOrganizationAccess({
    organizationId,
    scope: "gateway:invoke",
  });
  const isAiGatewayEnabled = useIsFeatureEnabled("aiGateway", {
    organizationId,
  });
  const session = useSession();

  const { showNotDeployedNotice, showManagement, showApiKeys, showModels } =
    gatewayPageAccess({
      organizationId,
      isAiGatewayEnabled,
      aiGatewayDeployed: session.data?.environment.aiGatewayDeployed,
      canManageGateway,
      canReadGateway,
      canInvokeGateway,
    });

  const setupStatus = api.aiGateway.getSetupStatus.useQuery(
    { orgId: organizationId ?? "" },
    {
      enabled:
        organizationId !== undefined &&
        (showManagement || showModels || showApiKeys),
    },
  );

  return {
    canManageGateway,
    showNotDeployedNotice,
    showManagement,
    showModels,
    showApiKeys,
    isIngestionConfigured: setupStatus.data?.isConfigured,
    isRecording: setupStatus.data?.isRecording,
    isSetupStatusPending: setupStatus.isPending,
  };
}
