import { z } from "zod/v4";

const gatewayAllowedModelsSchema = z.array(z.string().min(1)).nullable();

export function parseGatewayAllowedModels(value: unknown) {
  return gatewayAllowedModelsSchema.parse(value);
}
