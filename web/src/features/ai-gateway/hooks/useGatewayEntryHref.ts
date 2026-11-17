import { useSession } from "next-auth/react";

import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { visibleGatewayPages } from "@/src/features/ai-gateway/fns/visibleGatewayPages";

const ENTRY_ORDER = [
  GATEWAY_PAGE_SLUGS.overview,
  GATEWAY_PAGE_SLUGS.models,
  GATEWAY_PAGE_SLUGS.apiKeys,
] as const;

/** The first AI Gateway page the viewer can open in the organization, if any. */
export function useGatewayEntryHref(
  organizationId: string | undefined,
): string | undefined {
  const session = useSession();
  if (!organizationId) return undefined;
  const visible = visibleGatewayPages(session.data, organizationId);
  const slug = ENTRY_ORDER.find((entry) => visible[entry]);
  return slug ? buildGatewayPagePath(organizationId, slug) : undefined;
}
