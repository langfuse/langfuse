import type { AiGatewayEventMap } from "@/src/features/ai-gateway/types/aiGatewayAnalytics";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type GatewayBudgetChange = Omit<
  AiGatewayEventMap["ai_gateway:budget_removed"],
  "orgId"
> & {
  /** Null when the budget was removed. */
  spendLimit: GatewaySpendLimit | null;
};

/** Captures a saved budget's scope and interval, never its amount. */
export function useCaptureGatewayBudgetChange(organizationId: string) {
  const capture = usePostHogClientCapture();

  return ({ spendLimit, ...change }: GatewayBudgetChange) => {
    if (spendLimit) {
      capture("ai_gateway:budget_saved", {
        orgId: organizationId,
        ...change,
        interval: spendLimit.interval,
      });
    } else {
      capture("ai_gateway:budget_removed", {
        orgId: organizationId,
        ...change,
      });
    }
  };
}
