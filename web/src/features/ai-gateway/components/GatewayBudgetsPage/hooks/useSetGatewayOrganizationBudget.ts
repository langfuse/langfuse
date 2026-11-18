import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

/** Adds, replaces or removes one of the organization's own budgets. */
export function useSetGatewayOrganizationBudget(organizationId: string) {
  const utils = api.useUtils();
  const mutation = api.aiGateway.setOrganizationSpendLimit.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-budgets"),
  });

  /** Resolves true once saved; the error stays on `mutation` otherwise. A null id adds a budget, a null spendLimit removes it. */
  const setBudget = async (params: {
    id: string | null;
    spendLimit: GatewaySpendLimit | null;
  }) => {
    try {
      await mutation.mutateAsync({ orgId: organizationId, ...params });
      return true;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
      return false;
    } finally {
      await utils.aiGateway.listOrganizationSpendLimits.invalidate({
        orgId: organizationId,
      });
    }
  };

  return { setBudget, mutation };
}
