import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

export type GatewayBudgetSubject = "key" | "user";

export type GatewaySpendLimit = {
  interval: GatewaySpendBudgetInterval;
  limitUsd: number;
};

/** Replaces or removes the budgets of several keys or users at once. */
export function useSetGatewayBudgets(organizationId: string) {
  const utils = api.useUtils();
  const mutation = api.aiGateway.setSpendLimits.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-budgets"),
  });

  /** Resolves true once saved; the error stays on `mutation` otherwise. */
  const setBudgets = async (params: {
    subject: GatewayBudgetSubject;
    subjectIds: string[];
    spendLimit: GatewaySpendLimit | null;
  }) => {
    const orgId = organizationId;
    try {
      await mutation.mutateAsync({
        orgId,
        scope: params.subject === "key" ? "API_KEY" : "USER",
        subjectIds: params.subjectIds,
        spendLimit: params.spendLimit,
      });
      return true;
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-budgets");
      return false;
    } finally {
      // A conflict means the cached budgets are stale; reopening must load the current ones.
      await Promise.all([
        utils.aiGateway.listBudgets.invalidate({ orgId }),
        utils.aiGateway.listApiKeys.invalidate({ orgId }),
        utils.aiGateway.getApiKeysSpend.invalidate({ orgId }),
        utils.aiGateway.getUsersSpend.invalidate({ orgId }),
      ]);
    }
  };

  return { setBudgets, mutation };
}
