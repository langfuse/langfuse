export function normalizeGatewayAllowedModels(value: unknown): string[] | null {
  if (value === null) return null;
  if (
    !Array.isArray(value) ||
    value.some((model) => typeof model !== "string" || model.length === 0)
  ) {
    return [];
  }
  return [...new Set(value)];
}
