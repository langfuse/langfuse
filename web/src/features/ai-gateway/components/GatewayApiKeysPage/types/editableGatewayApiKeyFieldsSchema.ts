import { z } from "zod";

/** The key fields that can still be changed after the key is created. */
export const editableGatewayApiKeyFieldsSchema = z.object({
  metadata: z.array(z.object({ key: z.string(), value: z.string() })),
  modelPatterns: z.array(z.string()),
});

export type EditableGatewayApiKeyFields = z.infer<
  typeof editableGatewayApiKeyFieldsSchema
>;
