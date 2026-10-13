import { normalizeGatewayAllowedModels } from "@/src/features/ai-gateway/fns/normalizeGatewayAllowedModels";

export function toGatewayAllowedModelsSet(value: unknown) {
  const normalized = normalizeGatewayAllowedModels(value);
  return normalized === null ? null : new Set(normalized);
}
