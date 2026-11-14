import { type Session } from "next-auth";

import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { visibleGatewayPages } from "@/src/features/ai-gateway/fns/visibleGatewayPages";

const entryOrder = [
  GATEWAY_PAGE_SLUGS.overview,
  GATEWAY_PAGE_SLUGS.models,
  GATEWAY_PAGE_SLUGS.apiKeys,
] as const;

/** getGatewayEntryHref is the path of the first AI Gateway page, in overview, models, API keys order, that the session's user can open in the organization. */
export function getGatewayEntryHref(
  session: Session | null,
  organizationId: string | undefined,
): string | undefined {
  if (!organizationId) return undefined;
  const visible = visibleGatewayPages(session, organizationId);
  const slug = entryOrder.find((entry) => visible[entry]);
  if (!slug) return undefined;
  return buildGatewayPagePath(organizationId, slug);
}
