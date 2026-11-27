/** The call's own parameters. Null when empty, so the table does not render. */

import { type JsonNested } from "@langfuse/shared";

export function buildModelParameters(
  modelParameters: JsonNested | null | undefined,
): Record<string, unknown> | null {
  if (
    !modelParameters ||
    typeof modelParameters !== "object" ||
    Array.isArray(modelParameters)
  )
    return null;
  const entries = Object.entries(modelParameters).filter(
    ([, value]) => value !== null && value !== undefined,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}
