import { type Session } from "next-auth";
import { type PrismaClient } from "@langfuse/shared/src/db";

import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { isGatewayEnabledForOrganization } from "@/src/features/ai-gateway/server/availability";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";

const SETUP_GATED_SETTINGS_SLUGS = new Set([
  "ai-gateway-models",
  "ai-gateway-api-keys",
  "ai-gateway-analytics",
]);

/**
 * Gateway managers cannot open model, API key or analytics settings before an ingestion
 * project is configured; they are sent to the setup page.
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
    !SETUP_GATED_SETTINGS_SLUGS.has(slug) ||
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
  return isConfigured
    ? null
    : `/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway`;
}
