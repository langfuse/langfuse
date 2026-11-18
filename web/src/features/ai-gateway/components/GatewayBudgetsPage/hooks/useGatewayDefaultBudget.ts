import type { GatewayBudgetSubject } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useSetGatewayBudgets";
import { api } from "@/src/utils/api";

/** The organization's default budget for keys or users without their own: undefined while loading, null when none is set. */
export function useGatewayDefaultBudget(
  organizationId: string,
  subject: GatewayBudgetSubject,
) {
  const defaults = api.aiGateway.getDefaultSpendLimits.useQuery({
    orgId: organizationId,
  });
  return defaults.data?.[subject === "key" ? "API_KEY" : "USER"];
}
