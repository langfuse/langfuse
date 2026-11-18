import { api } from "@/src/utils/api";

/** The organization's own budgets, which cap all of its gateway spend. */
export function useGatewayOrganizationBudgets(organizationId: string) {
  return api.aiGateway.listOrganizationSpendLimits.useQuery({
    orgId: organizationId,
  });
}
