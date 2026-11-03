import { normalizeOrderByForTable, type OrderByState } from "@langfuse/shared";

/**
 * Sessions reuse the global `orderBy` query param. Remap time and duration
 * columns leaked from traces/events so the table query stays valid.
 */
export const normalizeSessionsOrderBy = (
  orderBy: OrderByState,
): OrderByState => {
  const timeNormalized = normalizeOrderByForTable({
    orderBy,
    expectedTimeColumn: "createdAt",
  });

  if (timeNormalized?.column === "latency") {
    return { ...timeNormalized, column: "sessionDuration" };
  }

  return timeNormalized;
};
