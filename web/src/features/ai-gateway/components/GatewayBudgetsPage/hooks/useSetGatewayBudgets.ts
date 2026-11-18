import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
  type RouterInputs,
} from "@/src/utils/api";

export type GatewayBudgetSubject = "key" | "user";

/** Explicit keys or users, or every one matching the table's search and status. */
export type GatewayBudgetTarget =
  RouterInputs["aiGateway"]["setSpendLimits"]["subjects"];

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
    subjects: GatewayBudgetTarget;
    spendLimit: GatewaySpendLimit | null;
  }) => {
    const orgId = organizationId;
    try {
      await mutation.mutateAsync({
        orgId,
        scope: params.subject === "key" ? "API_KEY" : "USER",
        subjects: params.subjects,
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
