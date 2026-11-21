import {
  GATEWAY_SPEND_TABS,
  type GatewaySpendTab,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";
import { useInvalidateGatewayBudgets } from "@/src/features/ai-gateway/hooks/useInvalidateGatewayBudgets";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

/** Gives keys or users without a budget the same one. */
export function useAddGatewayBudgets(organizationId: string) {
  const invalidateBudgets = useInvalidateGatewayBudgets(organizationId);
  const mutation = api.aiGateway.createSpendLimits.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-budgets"),
  });

  /** Resolves true once added; the error stays on `mutation` otherwise. */
  const addBudgets = async (params: {
    tab: GatewaySpendTab;
    subjectIds: string[];
    spendLimit: GatewaySpendLimit;
  }) => {
    try {
      await mutation.mutateAsync({
        orgId: organizationId,
        scope: GATEWAY_SPEND_TABS[params.tab].scope,
        subjectIds: params.subjectIds,
        spendLimit: params.spendLimit,
      });
      return true;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
      return false;
    } finally {
      // A conflict means a picked key or user got a budget meanwhile; the picker must show it.
      await invalidateBudgets();
    }
  };

  return { addBudgets, mutation };
}
