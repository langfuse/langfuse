import type {
  GatewayBudgetSubject,
  GatewaySpendLimit,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

/** Sets or removes the default budget of keys or users without their own. */
export function useSetGatewayDefaultBudget(organizationId: string) {
  const utils = api.useUtils();
  const mutation = api.aiGateway.setDefaultSpendLimit.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-budgets"),
  });

  /** Resolves true once saved; the error stays on `mutation` otherwise. */
  const setDefaultBudget = async (params: {
    subject: GatewayBudgetSubject;
    spendLimit: GatewaySpendLimit | null;
  }) => {
    const orgId = organizationId;
    try {
      await mutation.mutateAsync({
        orgId,
        scope: params.subject === "key" ? "API_KEY" : "USER",
        spendLimit: params.spendLimit,
      });
      return true;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
      return false;
    } finally {
      await Promise.all([
        utils.aiGateway.getDefaultSpendLimits.invalidate({ orgId }),
        utils.aiGateway.listBudgets.invalidate({ orgId }),
        utils.aiGateway.getApiKeysSpend.invalidate({ orgId }),
      ]);
    }
  };

  return { setDefaultBudget, mutation };
}
