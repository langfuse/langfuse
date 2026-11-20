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

  it("preserves the stored reset interval when editing an existing budget", () => {
    expect(
      toGatewaySpendBudgetFormValue({
        interval: "MONTHLY",
        limitUsd: 250,
        alertThresholds: [85, 100],
      }),
    ).toEqual({
      interval: "MONTHLY",
      limitUsd: "250",
      alertThresholds: [85, 100],
    });
  });
});
