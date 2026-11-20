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
  type RouterInputs,
} from "@/src/utils/api";

/** Explicit keys or users, or every one matching the table's search and status. */
export type GatewayBudgetTarget =
  RouterInputs["aiGateway"]["setSpendLimits"]["subjects"];

/** Replaces or removes the budgets of several keys or users at once. */
export function useSetGatewayBudgets(organizationId: string) {
  const invalidateBudgets = useInvalidateGatewayBudgets(organizationId);
  const mutation = api.aiGateway.setSpendLimits.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-budgets"),
  });

  /** Resolves true once saved; the error stays on `mutation` otherwise. */
  const setBudgets = async (params: {
    tab: GatewaySpendTab;
    subjects: GatewayBudgetTarget;
    spendLimit: GatewaySpendLimit | null;
  }) => {
    try {
      await mutation.mutateAsync({
        orgId: organizationId,
        scope: GATEWAY_SPEND_TABS[params.tab].scope,
        subjects: params.subjects,
        spendLimit: params.spendLimit,
      });
      return true;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
      return false;
    } finally {
      // A conflict means the cached budgets are stale; reopening must load the current ones.
      await invalidateBudgets();
    }
  };

  return { setBudgets, mutation };
}
