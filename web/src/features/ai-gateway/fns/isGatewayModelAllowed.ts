import { formatGatewayModelSlug } from "@/src/features/ai-gateway/fns/formatGatewayModelSlug";
import { matchesGatewayModelPatterns } from "@/src/features/ai-gateway/fns/gatewayModelPatterns";

/**
 * Whether a connection's allowlist enables a model. With `key`, the key's
 * model patterns must also allow the model's `connection:model` slug; they
 * only narrow what the allowlist enables.
 */
export function isGatewayModelAllowed(
  allowedModels: Set<string> | readonly string[] | null,
  model: string,
  key?: { connectionName: string; allowedModels: readonly string[] | null },
) {
  const isEnabled =
    allowedModels === null ||
    (allowedModels instanceof Set
      ? allowedModels.has(model)
      : allowedModels.includes(model));
  return (
    isEnabled &&
    (key === undefined ||
      matchesGatewayModelPatterns(
        key.allowedModels,
        formatGatewayModelSlug(key.connectionName, model),
      ))
  );
}
