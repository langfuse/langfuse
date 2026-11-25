import type { GatewayMetadata } from "@/src/features/ai-gateway/server/provider/registry";

/**
 * Metadata rows edit values as text, so a number or boolean the user left
 * unchanged comes back as a string; this puts the stored value back.
 */
export function restoreGatewayApiKeyMetadataTypes(
  metadata: GatewayMetadata,
  storedMetadata: unknown,
): GatewayMetadata {
  if (
    !storedMetadata ||
    typeof storedMetadata !== "object" ||
    Array.isArray(storedMetadata)
  ) {
    return metadata;
  }
  const stored = storedMetadata as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      const storedValue = stored[key];
      const isUnchangedTypedValue =
        (typeof storedValue === "number" || typeof storedValue === "boolean") &&
        String(storedValue) === value;
      return [key, isUnchangedTypedValue ? storedValue : value];
    }),
  );
}
