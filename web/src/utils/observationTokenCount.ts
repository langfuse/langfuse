import { ObservationType } from "@langfuse/shared";

import { numberFormatter } from "@/src/utils/numbers";

/**
 * Matches EMPTY_VALUE_PLACEHOLDER in the design-system table constants. Held
 * as a literal rather than imported: this module is a string formatter and
 * must not depend on the component tree.
 */
export const MISSING_OBSERVATION_TOKEN_COUNT_PLACEHOLDER = "—";

/**
 * Observation types that report their own token counts. A zero on these rows
 * is a measured count. Other types show a dash for zero, the same treatment
 * cost cells use when a row has no amount.
 */
const TOKEN_COUNT_OBSERVATION_TYPES = new Set<string>([
  ObservationType.GENERATION,
  ObservationType.EMBEDDING,
]);

/**
 * True when the cell should show a numeric token count.
 * Generations and embeddings include an explicit 0. Other types treat 0 as
 * unavailable. A non-zero count is shown for every type, including when the
 * type itself is missing.
 */
export function isObservationTokenCountDisplayable(
  count: number | null | undefined,
  observationType?: ObservationType | string | null,
): count is number {
  if (count == null) return false;
  if (count !== 0) return true;
  if (observationType == null) return true;
  return TOKEN_COUNT_OBSERVATION_TYPES.has(observationType);
}

export function formatObservationTokenCount(
  count: number | null | undefined,
  observationType?: ObservationType | string | null,
): string {
  if (!isObservationTokenCountDisplayable(count, observationType)) {
    return MISSING_OBSERVATION_TOKEN_COUNT_PLACEHOLDER;
  }
  return numberFormatter(count, 0, 0);
}
