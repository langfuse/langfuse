import { useSession } from "next-auth/react";

import { env } from "@/src/env.mjs";
import { canReadGatewayModels } from "@/src/features/ai-gateway/fns/canReadGatewayModels";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";
import { useHasOrganizationAccess } from "@/src/features/rbac";
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
    enableForAdmins: false,
    organizationId,
  });
  const session = useSession();

  /** Self-hosted without a gateway: managers get a pointer to the docs. */
  const showNotDeployedNotice =
    session.data?.environment.aiGatewayDeployed === false && canManageGateway;

  const showManagement = isAiGatewayEnabled && canManageGateway;
  /** Members manage their own gateway keys; managers see every key. */
  const showApiKeys = isAiGatewayEnabled && canInvokeGateway;
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
    isSetupStatusPending: setupStatus.isPending,
  };
}
