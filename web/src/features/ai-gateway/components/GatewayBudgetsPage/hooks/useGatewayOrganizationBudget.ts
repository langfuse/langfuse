import { api } from "@/src/utils/api";

/** The organization's own budget with its spend: undefined while loading, null when none is set. */
export function useGatewayOrganizationBudget(organizationId: string) {
  return api.aiGateway.getOrganizationSpendLimit.useQuery({
    orgId: organizationId,
  }).data;
}
