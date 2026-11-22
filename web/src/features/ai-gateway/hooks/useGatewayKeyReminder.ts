import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { api } from "@/src/utils/api";

/** Members of an org with a set-up gateway who have no key yet. */
export function useGatewayKeyReminder(organizationId: string | undefined) {
  const { showManagement, showApiKeys, isIngestionConfigured } =
    useGatewaySettingsAccess(organizationId);
  const isMember = showApiKeys && !showManagement;
  const ownKeys = api.aiGateway.listApiKeys.useQuery(
    { orgId: organizationId ?? "", page: 0, limit: 1 },
    {
      enabled:
        organizationId !== undefined &&
        isMember &&
        isIngestionConfigured === true,
    },
  );

  return (
    isMember && isIngestionConfigured === true && ownKeys.data?.totalCount === 0
  );
}
