/**
 * Utility functions for JSON expansion state normalization.
 *
 * These functions handle the translation between:
 * - Actual observation keys (e.g., "natural-language-filter (abc12345)")
 * - Normalized keys for persistent storage (e.g., "natural.language.filter")
 *
 * This normalization allows expansion state to persist across different traces
 * that have similarly-named observations, regardless of their specific IDs.
 */

/**
 * Normalizes an observation key for persistent storage.
 *
 * Transforms:
 * 1. Hyphens to dots (PrettyJsonView internal format)
 * 2. Removes observation ID suffix (8-char hex in parentheses)
 *
 * @example
 * normalizeKey("natural-language-filter (abc12345)") // "natural.language.filter"
 * normalizeKey("simple") // "simple"
 */
export function normalizeKey(key: string): string {
  return key.replace(/-/g, ".").replace(/\s*\([a-f0-9]{8}\)/, "");
}

/**
 * Converts actual expansion state to normalized form for persistent storage.
 *
 * @param actualState - The current expansion state with actual observation keys
 * @returns Normalized state suitable for storage, or boolean if input is boolean
 */
export function normalizeExpansionState(
  actualState: Record<string, boolean> | boolean,
): Record<string, boolean> | boolean {
  if (typeof actualState === "boolean") return actualState;

  const normalized: Record<string, boolean> = {};

  Object.entries(actualState).forEach(([key, value]) => {
    const normalizedKey = normalizeKey(key);
    normalized[normalizedKey] = value;
  });

  return normalized;
}

/**
 * Converts normalized expansion state back to actual state with observation IDs.
 *
 * This function maps normalized keys back to their actual observation keys,
 * handling:
 * - Top-level observation keys
 * - Nested paths within observations
 * - Multiple observations that normalize to the same key
 *
 * @param normalizedState - The stored normalized expansion state
 * @param observationKeys - Array of actual observation keys (e.g., ["filter (abc12345)", "filter (def67890)"])
 * @returns Denormalized state with actual observation keys, or boolean if input is boolean
 */
export function denormalizeExpansionState(
  normalizedState: Record<string, boolean> | boolean,
  observationKeys: string[],
): Record<string, boolean> | boolean {
  if (typeof normalizedState === "boolean") return normalizedState;

  // Build mapping: normalized observation name -> actual observation name(s)
  // Note: Multiple observations can normalize to the same key
  const normalizedToActual = new Map<string, string[]>();
  observationKeys.forEach((actualKey) => {
    const normalized = normalizeKey(actualKey);
    if (!normalizedToActual.has(normalized)) {
      normalizedToActual.set(normalized, []);
    }
    // Store with hyphens converted to dots (PrettyJsonView format)
    normalizedToActual.get(normalized)!.push(actualKey.replace(/-/g, "."));
  });

  const denormalized: Record<string, boolean> = {};

  Object.entries(normalizedState).forEach(([normalizedKey, value]) => {
    // First check if this is a top-level observation key (no nested path)
    if (normalizedToActual.has(normalizedKey)) {
      const actualKeys = normalizedToActual.get(normalizedKey)!;
      actualKeys.forEach((actualKey) => {
        denormalized[actualKey] = value;
      });
      return;
    }

    // Otherwise split key into top-level observation and nested path
    const parts = normalizedKey.split(".");
    const topLevelNormalized = parts[0];
    const restOfPath = parts.slice(1).join(".");

    // Find all actual observation keys that match this normalized key
    const actualTopLevelKeys = normalizedToActual.get(topLevelNormalized) || [];

    actualTopLevelKeys.forEach((actualTopLevel) => {
      const actualKey = restOfPath
        ? `${actualTopLevel}.${restOfPath}`
        : actualTopLevel;
      denormalized[actualKey] = value;
    });
  });

  return denormalized;
}
