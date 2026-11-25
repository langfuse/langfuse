import { useInvalidateGatewayBudgets } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayBudgets";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
  type RouterInputs,
} from "@/src/utils/api";

type ResetSpendLimitInput = Omit<
  RouterInputs["aiGateway"]["resetSpendLimit"],
  "orgId"
>;

/** Zeros the current period's spend for one key or user budget while keeping its limit. */
export function useResetGatewayBudget(organizationId: string) {
  const invalidateBudgets = useInvalidateGatewayBudgets(organizationId);
  const mutation = api.aiGateway.resetSpendLimit.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-budgets"),
  });

  const resetBudget = async (params: ResetSpendLimitInput) => {
    try {
      await mutation.mutateAsync({
        orgId: organizationId,
        ...params,
      });
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
      throw error;
    } finally {
      await invalidateBudgets();
    }
  };

  return { resetBudget, mutation };
}
