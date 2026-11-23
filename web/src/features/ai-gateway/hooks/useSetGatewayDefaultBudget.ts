import { useInvalidateGatewayBudgets } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayBudgets";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

/** Sets or removes the default budget of keys or users without their own. */
export function useSetGatewayDefaultBudget(organizationId: string) {
  const utils = api.useUtils();
  const invalidateBudgets = useInvalidateGatewayBudgets(organizationId);
  const mutation = api.aiGateway.setDefaultSpendLimit.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-budgets"),
  });

  /** Resolves true once saved; the error stays on `mutation` otherwise. */
  const setDefaultBudget = async (params: {
    subject: "key" | "user";
    spendLimit: GatewaySpendLimit | null;
  }) => {
    try {
      await mutation.mutateAsync({
        orgId: organizationId,
        scope: params.subject === "key" ? "API_KEY" : "USER",
        spendLimit: params.spendLimit,
      });
      return true;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
      return false;
    } finally {
      await Promise.all([
        utils.aiGateway.getDefaultSpendLimits.invalidate({
          orgId: organizationId,
        }),
        invalidateBudgets(),
      ]);
    }
  };

  return { setDefaultBudget, mutation };
}
