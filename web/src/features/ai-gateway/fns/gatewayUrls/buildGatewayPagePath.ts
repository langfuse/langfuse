import {
  GATEWAY_PAGE_SLUGS,
  type GatewayPageSlug,
} from "@/src/features/ai-gateway/constants/gatewayPageSlugs";

export function buildGatewayPagePath(
  organizationId: string,
  slug: GatewayPageSlug = GATEWAY_PAGE_SLUGS.overview,
) {
  const basePath = `/organization/${encodeURIComponent(organizationId)}/ai-gateway`;
  return slug === GATEWAY_PAGE_SLUGS.overview
    ? basePath
    : `${basePath}/${slug}`;
}
