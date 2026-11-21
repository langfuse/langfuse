import { type Session } from "next-auth";

import { type GatewayPageSlug } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import {
  gatewayPageAccess,
  gatewayPageVisibility,
} from "@/src/features/ai-gateway/fns/gatewayPageAccess";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

/** The AI Gateway sub-pages visible to the session in the organization. */
export function visibleGatewayPages(
  session: Session | null,
  organizationId: string | undefined,
): Record<GatewayPageSlug, boolean> {
  const can = (
    scope:
      | "gateway:manage"
      | "gateway:read"
      | "gateway:invoke"
      | "organizationSettings:read",
  ) =>
    organizationId !== undefined &&
    hasOrganizationAccess({ session, organizationId, scope });

  const access = gatewayPageAccess({
    organizationId,
    isAiGatewayEnabled:
      organizationId !== undefined &&
      getContextualFeatureFlags(session?.user, { organizationId })
        ?.aiGateway === true,
    aiGatewayDeployed: session?.environment?.aiGatewayDeployed,
    canManageGateway: can("gateway:manage"),
    canReadGateway: can("gateway:read"),
    canInvokeGateway: can("gateway:invoke"),
  });
  return gatewayPageVisibility(access, can("organizationSettings:read"));
}
