import { useSession } from "next-auth/react";

import { getGatewayEntryHref } from "@/src/features/ai-gateway/hooks/getGatewayEntryHref";

/** The first AI Gateway page the viewer can open in the organization, if any. */
export function useGatewayEntryHref(
  organizationId: string | undefined,
): string | undefined {
  const session = useSession();
  return getGatewayEntryHref(session.data, organizationId);
}
