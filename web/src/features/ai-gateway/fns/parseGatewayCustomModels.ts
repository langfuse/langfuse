import { z } from "zod/v4";

/** Objects rather than plain IDs, so per-model settings can be added later. */
const gatewayCustomModelSchema = z.object({ id: z.string().min(1) });

export type GatewayCustomModel = z.infer<typeof gatewayCustomModelSchema>;

export function parseGatewayCustomModels(value: unknown) {
  return z.array(gatewayCustomModelSchema).parse(value);
}
