import { type Session } from "next-auth";

import { gatewayPageAccess } from "@/src/features/ai-gateway/fns/gatewayPageAccess";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

/** Whether any AI Gateway page is visible to the session in the organization. */
export function canViewGatewayPages(
  session: Session | null,
  organizationId: string | undefined,
) {
  if (!organizationId) return false;
  const can = (scope: "gateway:manage" | "gateway:read" | "gateway:invoke") =>
    hasOrganizationAccess({ session, organizationId, scope });

  const access = gatewayPageAccess({
    organizationId,
    isAiGatewayEnabled:
      getContextualFeatureFlags(session?.user, { organizationId })
        ?.aiGateway === true,
    aiGatewayDeployed: session?.environment.aiGatewayDeployed,
    canManageGateway: can("gateway:manage"),
    canReadGateway: can("gateway:read"),
    canInvokeGateway: can("gateway:invoke"),
  });
  return Object.values(access).some(Boolean);
}
