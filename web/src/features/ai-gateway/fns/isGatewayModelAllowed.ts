import { normalizeGatewayAllowedModels } from "@/src/features/ai-gateway/fns/normalizeGatewayAllowedModels";

export function isGatewayModelAllowed(allowedModels: unknown, model: string) {
  const normalized = normalizeGatewayAllowedModels(allowedModels);
  return normalized === null || normalized.includes(model);
}
