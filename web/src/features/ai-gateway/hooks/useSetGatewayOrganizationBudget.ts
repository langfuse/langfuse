import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

/** Sets or removes the organization's own budget. */
export function useSetGatewayOrganizationBudget(organizationId: string) {
  const utils = api.useUtils();
  const mutation = api.aiGateway.setOrganizationSpendLimit.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-budgets"),
  });

  /** Resolves true once saved; the error stays on `mutation` otherwise. */
  const setBudget = async (spendLimit: GatewaySpendLimit | null) => {
    try {
      await mutation.mutateAsync({ orgId: organizationId, spendLimit });
      return true;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
      return false;
    } finally {
      await utils.aiGateway.getOrganizationSpendLimit.invalidate({
        orgId: organizationId,
      });
    }
  };

  return { setBudget, mutation };
}
