import { z } from "zod";

import type { GatewayApiKeyExpirationPreset } from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
import {
  GATEWAY_SPEND_BUDGET_MAX_USD,
  type GatewaySpendBudgetInterval,
} from "@/src/features/ai-gateway/constants/gatewaySpendBudgetIntervalOptions";
import { editableGatewayApiKeyFieldsSchema } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/types/editableGatewayApiKeyFieldsSchema";
import { resolveGatewayApiKeyExpiration } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/fns/resolveGatewayApiKeyExpiration";

/** The optional sections of a key, in the order a loaded key shows them. */
export const gatewayApiKeySections = [
  "expiration",
  "spendBudget",
  "models",
  "metadata",
] as const;

export type GatewayApiKeySection = (typeof gatewayApiKeySections)[number];

/** The spend budget of a key without one, and of a newly added section. */
export const emptyGatewaySpendBudget = {
  interval: "DAILY",
  limitUsd: "",
} as const satisfies { interval: GatewaySpendBudgetInterval; limitUsd: string };

const baseSchema = editableGatewayApiKeyFieldsSchema.extend({
  issuedAs: z.enum(["user", "serviceAccount"]),
  name: z
    .string()
    .max(500)
    .refine((name) => name.trim().length > 0, "Enter a name."),
  expiryPreset: z.custom<GatewayApiKeyExpirationPreset>(),
  customExpiry: z.string(),
  spendBudget: z.object({
    interval: z.custom<GatewaySpendBudgetInterval>(),
    limitUsd: z.string(),
  }),
  /** The optional sections shown, top to bottom. */
  sections: z.array(z.enum(gatewayApiKeySections)),
});

/** Without the expiration check, for keys whose locked expiration may lie in the past. */
export const gatewayApiKeyFormFieldsSchema = baseSchema.superRefine(
  (values, context) => {
    if (!values.sections.includes("spendBudget")) return;
    const message = getSpendBudgetLimitError(values.spendBudget.limitUsd);
    if (message) {
      context.addIssue({
        code: "custom",
        path: ["spendBudget", "limitUsd"],
        message,
      });
    }
  },
);

function getSpendBudgetLimitError(value: string) {
  const limitUsd = Number(value.trim() || NaN);
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) {
    return "Enter an amount greater than $0.";
  }
  if (limitUsd > GATEWAY_SPEND_BUDGET_MAX_USD) {
    return "Enter at most $1,000,000,000.";
  }
  return null;
}

export const gatewayApiKeyFormSchema = gatewayApiKeyFormFieldsSchema.refine(
  (values) =>
    resolveGatewayApiKeyExpiration(values.expiryPreset, values.customExpiry) !==
    undefined,
  { path: ["customExpiry"], message: "Choose a future date." },
);

export type GatewayApiKeyFormValues = z.infer<typeof gatewayApiKeyFormSchema>;
