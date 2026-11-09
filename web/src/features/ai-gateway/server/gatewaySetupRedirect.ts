import { type Session } from "next-auth";
import { type PrismaClient } from "@langfuse/shared/src/db";

import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { isGatewayEnabledForOrganization } from "@/src/features/ai-gateway/server/availability";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";

const SETUP_GATED_PAGE_SLUGS = new Set<string>([
  GATEWAY_PAGE_SLUGS.models,
  GATEWAY_PAGE_SLUGS.apiKeys,
]);

/**
 * Gateway managers cannot open the Models or Gateway keys pages before an
 * ingestion project is configured; they are sent to the setup on Overview.
 * Other members are not redirected because their Models and API key pages
 * explain the state.
 */
export async function getGatewaySetupRedirect(params: {
  prisma: PrismaClient;
  session: Session | null;
  organizationId: string;
  slug: string;
}): Promise<string | null> {
  const { prisma, session, organizationId, slug } = params;
  if (
    !SETUP_GATED_PAGE_SLUGS.has(slug) ||
    !isGatewayEnabledForOrganization(organizationId) ||
    !hasOrganizationAccess({
      session,
      organizationId,
      scope: "gateway:manage",
    })
  ) {
    return null;
  }

  const { isConfigured } = await new GatewayConfigService(
    prisma,
  ).getSetupStatus(organizationId);
  return isConfigured ? null : buildGatewayPagePath(organizationId);
}
