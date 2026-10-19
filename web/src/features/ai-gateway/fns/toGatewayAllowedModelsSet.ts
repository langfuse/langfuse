import { parseGatewayAllowedModels } from "@/src/features/ai-gateway/fns/parseGatewayAllowedModels";

export function toGatewayAllowedModelsSet(value: unknown) {
  const allowedModels = parseGatewayAllowedModels(value);
  return allowedModels === null ? null : new Set(allowedModels);
}
