import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { api } from "@/src/utils/api";

/** A gateway member's next step in an org; undefined while loading */
export function useGatewayMemberStatus(organizationId: string) {
  const { isIngestionConfigured } = useGatewaySettingsAccess(organizationId);
  // Members only see their own keys, so one row answers "has a key".
  const ownKeys = api.aiGateway.listApiKeys.useQuery(
    { orgId: organizationId, page: 0, limit: 1 },
    { enabled: isIngestionConfigured === true },
  );

  if (isIngestionConfigured === false) return "setupPending";
  if (ownKeys.data === undefined) return undefined;
  return ownKeys.data.totalCount === 0 ? "noKey" : "hasKey";
}
