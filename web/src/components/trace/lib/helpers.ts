import { ObservationType } from "@langfuse/shared";
import { type NestedObservation } from "@/src/utils/types";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import Decimal from "decimal.js";

export type TreeItemType = ObservationType | "TRACE";

export const treeItemColors: Map<TreeItemType, string> = new Map([
  [ObservationType.SPAN, "bg-muted-blue"],
  [ObservationType.GENERATION, "bg-muted-orange"],
  [ObservationType.EVENT, "bg-muted-green"],
  ["TRACE", "bg-input"],
]);

export function nestObservations(
  list: ObservationReturnType[],
): NestedObservation[] {
  if (list.length === 0) return [];

  // Data prep: Remove parentObservationId attribute from observations if the id does not exist in the list of observations
  const mutableList = list.map((o) => ({ ...o }));
  mutableList.forEach((observation) => {
    if (
      observation.parentObservationId &&
      !list.find((o) => o.id === observation.parentObservationId)
    ) {
      observation.parentObservationId = null;
    }
  });

  // Step 0: Sort the list by start time to ensure observations are in right order
  const sortedObservations = mutableList.sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  // Step 1: Create a map where the keys are object IDs, and the values are
  // the corresponding objects with an added 'children' property.
  const map = new Map<string, NestedObservation>();
  for (const obj of sortedObservations) {
    map.set(obj.id, { ...obj, children: [] });
  }

  // Step 2: Create another map for the roots of all trees.
  const roots = new Map<string, NestedObservation>();

  // Step 3: Populate the 'children' arrays and root map.
  for (const obj of map.values()) {
    if (obj.parentObservationId) {
      const parent = map.get(obj.parentObservationId);
      if (parent) {
        parent.children.push(obj);
      }
    } else {
      roots.set(obj.id, obj);
    }
  }

  // Step 4: Sort children by start time for each parent
  for (const obj of map.values()) {
    obj.children.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  // Step 5: Return the roots.
  return Array.from(roots.values());
}

export function calculateDisplayTotalCost(p: {
  allObservations: ObservationReturnType[];
  rootObservationId?: string;
}): Decimal | undefined {
  // if parentObservationId is provided, only calculate cost for children of that observation
  // need to be checked recursively for all children and children of children
  // loop until no more children to be added
  let observations = p.allObservations;

  if (p.rootObservationId) {
    observations = observations.filter(
      (o) =>
        o.parentObservationId === p.rootObservationId ||
        o.id === p.rootObservationId,
    );

    while (true) {
      const childrenToAdd = p.allObservations.filter(
        (o) =>
          o.parentObservationId &&
          !observations.map((o2) => o2.id).includes(o.id) &&
          observations.map((o2) => o2.id).includes(o.parentObservationId),
      );
      if (childrenToAdd.length === 0) break;
      observations = [...observations, ...childrenToAdd];
    }
  }

  const totalCost = observations.reduce(
    (prev: Decimal | undefined, curr: ObservationReturnType) => {
      // if we don't have any calculated costs, we can't do anything
      if (
        !curr.calculatedTotalCost &&
        !curr.calculatedInputCost &&
        !curr.calculatedOutputCost
      )
        return prev;

      // if we have either input or output cost, but not total cost, we can use that
      if (
        !curr.calculatedTotalCost &&
        (curr.calculatedInputCost || curr.calculatedOutputCost)
      ) {
        return prev
          ? prev.plus(
              curr.calculatedInputCost ??
                new Decimal(0).plus(
                  curr.calculatedOutputCost ?? new Decimal(0),
                ),
            )
          : curr.calculatedInputCost ?? curr.calculatedOutputCost ?? undefined;
      }

      if (!curr.calculatedTotalCost) return prev;

      // if we have total cost, we can use that
      return prev
        ? prev.plus(curr.calculatedTotalCost)
        : curr.calculatedTotalCost;
    },
    undefined,
  );

  return totalCost;
}
