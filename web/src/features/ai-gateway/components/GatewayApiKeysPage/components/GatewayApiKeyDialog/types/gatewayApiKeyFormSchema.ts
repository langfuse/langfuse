import { z } from "zod";

import type { GatewayApiKeyExpirationPreset } from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
import { getGatewaySpendBudgetLimitError } from "@/src/features/ai-gateway/fns/getGatewaySpendBudgetLimitError";
import { gatewaySpendBudgetFormSchema } from "@/src/features/ai-gateway/types/gatewaySpendBudgetFormSchema";
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

const baseSchema = editableGatewayApiKeyFieldsSchema.extend({
  issuedAs: z.enum(["user", "serviceAccount"]),
  name: z
    .string()
    .max(500)
    .refine((name) => name.trim().length > 0, "Enter a name."),
  expiryPreset: z.custom<GatewayApiKeyExpirationPreset>(),
  customExpiry: z.string(),
  spendBudget: gatewaySpendBudgetFormSchema,
  /** The optional sections shown, top to bottom. */
  sections: z.array(z.enum(gatewayApiKeySections)),
});

/** Without the expiration check, for keys whose locked expiration may lie in the past. */
export const gatewayApiKeyFormFieldsSchema = baseSchema.superRefine(
  (values, context) => {
    if (!values.sections.includes("spendBudget")) return;
    const message = getGatewaySpendBudgetLimitError(
      values.spendBudget.limitUsd,
    );
    if (message) {
      context.addIssue({
        code: "custom",
        path: ["spendBudget", "limitUsd"],
        message,
      });
    }
  },
);

export const gatewayApiKeyFormSchema = gatewayApiKeyFormFieldsSchema.refine(
  (values) =>
    resolveGatewayApiKeyExpiration(values.expiryPreset, values.customExpiry) !==
    undefined,
  { path: ["customExpiry"], message: "Choose a future date." },
);

export type GatewayApiKeyFormValues = z.infer<typeof gatewayApiKeyFormSchema>;
