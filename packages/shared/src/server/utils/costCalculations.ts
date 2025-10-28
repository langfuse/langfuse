import Decimal from "decimal.js";

/**
 * Shared cost calculation utilities
 */

export type ObservationCostData = {
  id: string;
  parentObservationId?: string | null;
  totalCost?: number | string | Decimal | null;
  inputCost?: number | string | Decimal | null;
  outputCost?: number | string | Decimal | null;
};

/**
 * Find all descendants of a root observation (recursive)
 */
export const findObservationDescendants = <T extends ObservationCostData>(
  rootObsId: string,
  allObservations: T[],
): T[] => {
  let relevantObs = allObservations.filter(
    (o) => o.id === rootObsId || o.parentObservationId === rootObsId,
  );

  // Recursively add children
  while (true) {
    const childrenToAdd = allObservations.filter(
      (o) =>
        o.parentObservationId &&
        !relevantObs.some((o2) => o2.id === o.id) &&
        relevantObs.some((o2) => o2.id === o.parentObservationId),
    );
    if (childrenToAdd.length === 0) break;
    relevantObs = [...relevantObs, ...childrenToAdd];
  }

  return relevantObs;
};

/**
 * Sum costs for a list of observations
 */
export const sumObservationCosts = (
  observations: ObservationCostData[],
): Decimal | undefined => {
  return observations.reduce<Decimal | undefined>((prev, curr) => {
    const totalCost = curr.totalCost ? new Decimal(curr.totalCost) : undefined;
    const inputCost = curr.inputCost ? new Decimal(curr.inputCost) : undefined;
    const outputCost = curr.outputCost
      ? new Decimal(curr.outputCost)
      : undefined;

    // No cost data - skip
    if (!totalCost && !inputCost && !outputCost) return prev;

    // Prefer total cost
    if (totalCost && !totalCost.isZero()) {
      return prev ? prev.plus(totalCost) : totalCost;
    }

    // Fallback to input + output
    if (inputCost || outputCost) {
      const input = inputCost || new Decimal(0);
      const output = outputCost || new Decimal(0);
      const combinedCost = input.plus(output);

      return prev
        ? prev.plus(combinedCost)
        : combinedCost.isZero()
          ? undefined
          : combinedCost;
    }

    return prev;
  }, undefined);
};

/**
 * Calculate recursive total cost for an observation and all its children
 */
export const calculateRecursiveCost = (
  rootObsId: string,
  allObservations: ObservationCostData[],
): Decimal | undefined => {
  const descendants = findObservationDescendants(rootObsId, allObservations);
  return sumObservationCosts(descendants);
};
