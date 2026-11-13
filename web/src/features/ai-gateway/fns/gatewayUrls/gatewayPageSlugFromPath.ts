import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";

const GATEWAY_PATH =
  /^\/organization\/[^/?#]+\/ai-gateway(?:\/([^/?#]+))?\/?(?:[?#]|$)/;

/** The AI Gateway sub-page slug an app path points at, or null outside the gateway. */
export function gatewayPageSlugFromPath(asPath: string): string | null {
  const match = GATEWAY_PATH.exec(asPath);
  if (!match) return null;
  return match[1] ?? GATEWAY_PAGE_SLUGS.overview;
}
