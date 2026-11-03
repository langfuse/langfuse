import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { type OrganizationSettingsTileState } from "@/src/features/organizations/components/OrganizationSettingsTile/OrganizationSettingsTile";
import { api } from "@/src/utils/api";

/** A gateway member's next step in an org, as an OrganizationSettingsTile state */
export function useGatewayMemberStatus(
  organizationId: string,
): OrganizationSettingsTileState {
  const { isIngestionConfigured } = useGatewaySettingsAccess(organizationId);
  // Members only see their own keys, so one row answers "has a key".
  const ownKeys = api.aiGateway.listApiKeys.useQuery(
    { orgId: organizationId, page: 0, limit: 1 },
    { enabled: isIngestionConfigured === true },
  );

  if (isIngestionConfigured === false) return "gatewaySetupPending";
  if (ownKeys.data === undefined) return "gatewayLoading";
  return ownKeys.data.totalCount === 0 ? "gatewayNoKey" : "gatewayHasKey";
}
