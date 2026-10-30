/**
 * The experiment items table's column order as it shipped previously:
 * the ids and the operational metrics held the space to the left of the fold,
 * so the score columns — and the aggregate analysis their headers now carry —
 * only appeared after a horizontal scroll.
 */
const PREVIOUS_DEFAULT_ORDER = [
  "select",
  "itemId",
  "observationId",
  "startTime",
  "level",
  "totalCost",
  "latencyMs",
  "experimentId",
  "input",
  "expectedOutput",
  "output",
  "observationScores",
  "traceScores",
];

/** A column that is always defined, so its absence means "not built yet". */
const ALWAYS_PRESENT_ID = "traceScores";

/**
 * Whether a stored order is still a default the app handed out, rather than an
 * arrangement of the user's own: the ids it shares with the old default appear
 * in the old default's relative order. Columns that came or went since (a
 * conditional column such as `expectedOutput`) are ignored, so their absence
 * does not read as a reorder.
 */
const isUntouchedDefault = (order: string[]): boolean => {
  const shared = order.filter((id) => PREVIOUS_DEFAULT_ORDER.includes(id));
  const expected = PREVIOUS_DEFAULT_ORDER.filter((id) => order.includes(id));
  return shared.join(" ") === expected.join(" ");
};

/**
 * Let the score columns' new default slot reach returning users.
 * The reconciliation in `useColumnOrder` never overrides a stored order, so
 * without this a new default only ever reaches new users — but a user who
 * arranged the columns himself is left alone.
 */
export const resetStaleDefaultColumnOrder = (
  order: string[],
): string[] | null => {
  if (!order.includes(ALWAYS_PRESENT_ID)) return null; // defer: no columns yet
  if (!isUntouchedDefault(order)) return order; // his own order, not ours

  // Dropping the stored order makes `useColumnOrder` rebuild it from the
  // table's current column definitions, so the new default lives in exactly one
  // place: the column list itself.
  return [];
};
