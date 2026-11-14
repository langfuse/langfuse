import { type Session } from "next-auth";
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
  return getGatewayEntryHref(session.data, organizationId);
}

/** getGatewayEntryHref is the path of the first AI Gateway page the session's user can open in the organization. */
function getGatewayEntryHref(
  session: Session | null,
  organizationId: string | undefined,
): string | undefined {
  if (!organizationId) return undefined;
  const visible = visibleGatewayPages(session, organizationId);
  const slug = ENTRY_ORDER.find((entry) => visible[entry]);
  if (!slug) return undefined;
  return buildGatewayPagePath(organizationId, slug);
}
