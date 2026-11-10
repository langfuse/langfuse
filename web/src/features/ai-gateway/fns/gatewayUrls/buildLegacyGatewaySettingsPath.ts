import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayModelsUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayModelsUrl";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";

/** The former Setup page and the Providers page it became both open the Models page. */
export function buildGatewayProvidersRedirectPath(
  organizationId: string,
  connectionId: string | undefined,
) {
  return connectionId
    ? buildGatewayModelsUrl(organizationId, connectionId)
    : buildGatewayPagePath(organizationId, GATEWAY_PAGE_SLUGS.models);
}

/**
 * Where a former `settings/ai-gateway*` page lives now, or undefined for other
 * settings pages. Saved Cmd-K recents still open these URLs.
 */
export function buildLegacyGatewaySettingsPath(
  organizationId: string,
  slug: string,
  connectionId: string | undefined,
): string | undefined {
  switch (slug) {
    case "ai-gateway":
      return buildGatewayProvidersRedirectPath(organizationId, connectionId);
    case "ai-gateway-models":
      return buildGatewayPagePath(organizationId, GATEWAY_PAGE_SLUGS.models);
    case "ai-gateway-api-keys":
      return buildGatewayPagePath(organizationId, GATEWAY_PAGE_SLUGS.apiKeys);
    case "ai-gateway-analytics":
      return buildGatewayPagePath(organizationId);
    default:
      return undefined;
  }
}
