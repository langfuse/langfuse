import { env } from "@/src/env.mjs";
import { canReadGatewayModels } from "@/src/features/ai-gateway/fns/canReadGatewayModels";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

/**
 * Single source for who sees which gateway settings and whether setup is done.
 * `isIngestionConfigured` stays undefined while loading so callers never gate
 * (or redirect) on a status they have not received yet.
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
  const isAiGatewayEnabled = useIsFeatureEnabled("aiGateway", {
    enableForAdmins: false,
    organizationId,
  });

  const showManagement = isAiGatewayEnabled && canManageGateway;
  const showModels =
    isAiGatewayEnabled &&
    organizationId !== undefined &&
    canReadGatewayModels({
      organizationId,
      demoOrganizationId: env.NEXT_PUBLIC_DEMO_ORG_ID,
      canReadGateway,
      canManageGateway,
    });

  const setupStatus = api.aiGateway.getSetupStatus.useQuery(
    { orgId: organizationId ?? "" },
    { enabled: organizationId !== undefined && (showManagement || showModels) },
  );

  return {
    canManageGateway,
    showManagement,
    showModels,
    isIngestionConfigured: setupStatus.data?.isConfigured,
    isSetupStatusPending: setupStatus.isPending,
  };
}
