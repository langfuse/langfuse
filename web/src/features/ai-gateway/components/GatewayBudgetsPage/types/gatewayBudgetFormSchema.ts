import { z } from "zod";

import type { GatewaySpendBudgetInterval } from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { getGatewaySpendBudgetLimitError } from "@/src/features/ai-gateway/fns/getGatewaySpendBudgetLimitError";

/** A form that sets one budget: its amount and reset interval. */
export const gatewayBudgetFormSchema = z.object({
  spendBudget: z.object({
    interval: z.custom<GatewaySpendBudgetInterval>(),
    limitUsd: z.string().superRefine((value, context) => {
      const message = getGatewaySpendBudgetLimitError(value);
      if (message) context.addIssue({ code: "custom", message });
    }),
  }),
});

export type GatewayBudgetFormValues = z.infer<typeof gatewayBudgetFormSchema>;
