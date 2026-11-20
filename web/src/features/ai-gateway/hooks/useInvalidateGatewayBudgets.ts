import { api } from "@/src/utils/api";

/** Refetches everything that shows key or user budgets, after any budget change. */
export function useInvalidateGatewayBudgets(organizationId: string) {
  const utils = api.useUtils();
  return () =>
    Promise.all([
      utils.aiGateway.listBudgets.invalidate({ orgId: organizationId }),
      utils.aiGateway.listMatchingBudgetSubjects.invalidate({
        orgId: organizationId,
      }),
      utils.aiGateway.listApiKeys.invalidate({ orgId: organizationId }),
      utils.aiGateway.getApiKeysSpend.invalidate({ orgId: organizationId }),
    ]);
}
