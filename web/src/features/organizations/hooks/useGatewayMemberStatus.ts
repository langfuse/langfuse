import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { isApiKeyExpired } from "@/src/features/apiKey/helpers/isApiKeyExpired";
import { type OrganizationSettingsTileState } from "@/src/features/organizations/components/OrganizationSettingsTile/OrganizationSettingsTile";
import { api } from "@/src/utils/api";

/** A gateway member's next step in an org, as an OrganizationSettingsTile state */
export function useGatewayMemberStatus(
  organizationId: string,
): OrganizationSettingsTileState {
  const { isIngestionConfigured, isSetupStatusPending } =
    useGatewaySettingsAccess(organizationId);
  // Members only see their own keys. Sorted by expiry descending (no expiry
  // first), the first row is live exactly when the member has a live key.
  const longestLivedKey = api.aiGateway.listApiKeys.useQuery(
    {
      orgId: organizationId,
      page: 0,
      limit: 1,
      orderBy: { column: "expiresAt", order: "DESC" },
    },
    { enabled: isIngestionConfigured === true },
  );

  if (isIngestionConfigured === false) return "gatewaySetupPending";
  // On a failed status query, still offer key creation; the keys page reports the error.
  if (
    longestLivedKey.isError ||
    (!isSetupStatusPending && isIngestionConfigured === undefined)
  ) {
    return "gatewayNoKey";
  }
  if (longestLivedKey.data === undefined) return "gatewayLoading";
  const key = longestLivedKey.data.data[0];
  return key === undefined || isApiKeyExpired(key.apiKey.expiresAt)
    ? "gatewayNoKey"
    : "gatewayHasKey";
}
