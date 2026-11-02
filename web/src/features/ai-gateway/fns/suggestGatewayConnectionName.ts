import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export function suggestGatewayConnectionName(
  provider: GatewayProvider,
  existingNames: Iterable<string>,
) {
  const base = providerLabels[provider].toLowerCase();
  /** Case-insensitive so suggestions never near-duplicate an existing name. */
  const taken = new Set(
    Array.from(existingNames, (name) => name.toLowerCase()),
  );
  if (!taken.has(base)) return base;
  for (let suffix = 1; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
