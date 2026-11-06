import { type Session } from "next-auth";

import { env } from "@/src/env.mjs";
import { canReadGatewayModels } from "@/src/features/ai-gateway/fns/canReadGatewayModels";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

/** Whether any AI Gateway page is visible; mirrors `useGatewaySettingsAccess` for the sidebar. */
export function canViewGatewayPages(
  session: Session | null,
  organizationId: string | undefined,
) {
  if (!organizationId) return false;
  const can = (scope: "gateway:manage" | "gateway:read" | "gateway:invoke") =>
    hasOrganizationAccess({ session, organizationId, scope });
  const canManageGateway = can("gateway:manage");

  if (session?.environment.aiGatewayDeployed === false && canManageGateway) {
    return true;
  }
  if (
    getContextualFeatureFlags(session?.user, { organizationId })?.aiGateway !==
    true
  ) {
    return false;
  }
  return (
    canManageGateway ||
    can("gateway:invoke") ||
    canReadGatewayModels({
      organizationId,
      demoOrganizationId: env.NEXT_PUBLIC_DEMO_ORG_ID,
      canReadGateway: can("gateway:read"),
      canManageGateway,
    })
  );
}
