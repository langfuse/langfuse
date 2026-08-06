import { type NestedObservation } from "@/src/utils/types";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { type ObservationLevelType, ObservationLevel } from "@langfuse/shared";

export function nestObservations(
  list: ObservationReturnType[],
  minLevel?: ObservationLevelType,
): {
  nestedObservations: NestedObservation[];
  hiddenObservationsCount: number;
} {
  if (list.length === 0)
    return { nestedObservations: [], hiddenObservationsCount: 0 };

  // Data prep:
  // - Filter for observations with minimum level
  // - Remove parentObservationId attribute from observations if the id does not exist in the list of observations
  const mutableList = list.filter((o) =>
    getObservationLevels(minLevel).includes(o.level),
  );
  const hiddenObservationsCount = list.length - mutableList.length;

  // Build a Set of all observation IDs for O(1) lookup instead of O(n) find
  const observationIds = new Set(list.map((o) => o.id));

  mutableList.forEach((observation) => {
    if (
      observation.parentObservationId &&
      !observationIds.has(observation.parentObservationId)
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
  return {
    nestedObservations: Array.from(roots.values()),
    hiddenObservationsCount,
  };
}

function getObservationLevels(minLevel: ObservationLevelType | undefined) {
  const ascendingLevels = [
    ObservationLevel.DEBUG,
    ObservationLevel.DEFAULT,
    ObservationLevel.WARNING,
    ObservationLevel.ERROR,
  ];

  if (!minLevel) return ascendingLevels;

  const minLevelIndex = ascendingLevels.indexOf(minLevel);

  return ascendingLevels.slice(minLevelIndex);
}
