import { type Session } from "next-auth";
import { type PrismaClient } from "@langfuse/shared/src/db";

import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { isGatewayEnabledForOrganization } from "@/src/features/ai-gateway/server/availability";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import {
  aiGatewayPath,
  type AiGatewayPageSlug,
} from "@/src/features/ai-gateway/fns/gatewayUrls/aiGatewayPath";

const SETUP_GATED_SLUGS = new Set<string>(["models", "keys", "analytics"]);

const LEGACY_SETTINGS_SLUGS: Record<string, AiGatewayPageSlug> = {
  "ai-gateway": "setup",
  "ai-gateway-models": "models",
  "ai-gateway-api-keys": "keys",
  "ai-gateway-analytics": "analytics",
};

/** Maps a former `/settings/ai-gateway*` URL to its AI Gateway page. */
export function getLegacyGatewaySettingsRedirect(
  organizationId: string,
  settingsSlug: string,
  search: string,
): string | null {
  const slug = LEGACY_SETTINGS_SLUGS[settingsSlug];
  return slug ? `${aiGatewayPath(organizationId, slug)}${search}` : null;
}

/**
 * Gateway managers cannot open the model, API key or analytics pages before an ingestion
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
    !SETUP_GATED_SLUGS.has(slug) ||
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
  return isConfigured ? null : aiGatewayPath(organizationId);
}
