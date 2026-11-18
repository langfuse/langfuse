import {
  GATEWAY_SPEND_INTERVALS,
  type GatewaySpendInterval,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendIntervals";

/** The spend chart's interval for a tab value; undefined for anything else. */
export function toGatewaySpendInterval(
  value: string,
): GatewaySpendInterval | undefined {
  return GATEWAY_SPEND_INTERVALS.find((option) => option.value === value)
    ?.value;
}
