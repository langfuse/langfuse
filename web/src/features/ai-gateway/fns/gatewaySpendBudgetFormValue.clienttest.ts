import { DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetAlertThresholds";
import { toGatewaySpendBudgetFormValue } from "./gatewaySpendBudgetFormValue";

describe("toGatewaySpendBudgetFormValue", () => {
  it("defaults new budgets to never resetting", () => {
    expect(toGatewaySpendBudgetFormValue(null)).toEqual({
      interval: "TOTAL",
      limitUsd: "",
      alertThresholds: [...DEFAULT_GATEWAY_SPEND_BUDGET_ALERT_THRESHOLDS],
    });
  });
});
