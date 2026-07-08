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
 * Find all descendants of a root observation using BFS traversal
 */
export const findObservationDescendants = <T extends ObservationCostData>(
  rootObsId: string,
  allObservations: T[],
): T[] => {
  // Build lookup structures for efficient traversal
  const childrenByParentId = new Map<string, T[]>();
  const observationById = new Map<string, T>();

  for (const obs of allObservations) {
    observationById.set(obs.id, obs);
    if (obs.parentObservationId) {
      if (!childrenByParentId.has(obs.parentObservationId)) {
        childrenByParentId.set(obs.parentObservationId, []);
      }
      childrenByParentId.get(obs.parentObservationId)!.push(obs);
    }
  }

  // BFS traversal starting from root
  const result: T[] = [];
  const visited = new Set<string>();
  const queue = [rootObsId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;

    visited.add(currentId);
    const currentObs = observationById.get(currentId);
    if (currentObs) {
      result.push(currentObs);
    }

    // Add unvisited children to queue
    const children = childrenByParentId.get(currentId) ?? [];
    for (const child of children) {
      if (!visited.has(child.id)) {
        queue.push(child.id);
      }
    }
  }

  return result;
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

      if (combinedCost.isZero()) {
        return prev;
      }

      return prev ? prev.plus(combinedCost) : combinedCost;
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
