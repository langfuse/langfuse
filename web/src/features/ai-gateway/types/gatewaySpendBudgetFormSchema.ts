import { z } from "zod";

import type { GatewaySpendBudgetAlertThreshold } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetAlertThresholds";
import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { getGatewaySpendBudgetLimitError } from "@/src/features/ai-gateway/fns/getGatewaySpendBudgetLimitError";

/** A spend budget as a form holds it; the amount stays text so it can be empty while typing. */
export const gatewaySpendBudgetFormSchema = z.object({
  interval: z.custom<GatewaySpendBudgetInterval>(),
  limitUsd: z.string(),
  alertThresholds: z.array(z.custom<GatewaySpendBudgetAlertThreshold>()),
});

/** The same, with the amount checked, for forms where the budget is required. */
export const requiredGatewaySpendBudgetFormSchema =
  gatewaySpendBudgetFormSchema.superRefine((value, context) => {
    const message = getGatewaySpendBudgetLimitError(value.limitUsd);
    if (message) {
      context.addIssue({ code: "custom", path: ["limitUsd"], message });
    }
  });

/** The same, for forms where an empty amount means no budget. */
export const optionalGatewaySpendBudgetFormSchema =
  gatewaySpendBudgetFormSchema.superRefine((value, context) => {
    if (value.limitUsd.trim() === "") return;
    const message = getGatewaySpendBudgetLimitError(value.limitUsd);
    if (message) {
      context.addIssue({ code: "custom", path: ["limitUsd"], message });
    }
  });

export type GatewaySpendBudgetFormValue = z.infer<
  typeof gatewaySpendBudgetFormSchema
>;
