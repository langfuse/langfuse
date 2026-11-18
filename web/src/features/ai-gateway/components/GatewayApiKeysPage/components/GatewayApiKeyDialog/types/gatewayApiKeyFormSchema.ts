import { z } from "zod";

import type { GatewayApiKeyExpirationPreset } from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
import { editableGatewayApiKeyFieldsSchema } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/types/editableGatewayApiKeyFieldsSchema";
import { resolveGatewayApiKeyExpiration } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/fns/resolveGatewayApiKeyExpiration";

export const gatewayApiKeyFormFieldsSchema =
  editableGatewayApiKeyFieldsSchema.extend({
    issuedAs: z.enum(["user", "serviceAccount"]),
    name: z
      .string()
      .max(500)
      .refine((name) => name.trim().length > 0, "Enter a name."),
    expiryPreset: z.custom<GatewayApiKeyExpirationPreset>(),
    customExpiry: z.string(),
  });

export const gatewayApiKeyFormSchema = gatewayApiKeyFormFieldsSchema.refine(
  (values) =>
    resolveGatewayApiKeyExpiration(values.expiryPreset, values.customExpiry) !==
    undefined,
  { path: ["customExpiry"], message: "Choose a future date." },
);

export type GatewayApiKeyFormValues = z.infer<typeof gatewayApiKeyFormSchema>;
