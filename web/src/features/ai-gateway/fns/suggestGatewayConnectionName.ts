import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export function suggestGatewayConnectionName(
  provider: GatewayProvider,
  existingNames: Iterable<string>,
) {
  const base = providerLabels[provider];
  // Compared case-insensitively so suggestions never read as near-duplicates
  // of an existing slug prefix, even though the database allows them.
  const taken = new Set(
    Array.from(existingNames, (name) => name.toLowerCase()),
  );
  if (!taken.has(base.toLowerCase())) return base;
  for (let suffix = 1; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
