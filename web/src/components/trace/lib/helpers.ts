import { $Enums } from "@langfuse/shared";
import { type NestedObservation } from "@/src/utils/types";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";

export type TreeItemType = $Enums.ObservationType | "TRACE";

export const treeItemColors: Map<TreeItemType, string> = new Map([
  [$Enums.ObservationType.SPAN, "bg-muted-blue"],
  [$Enums.ObservationType.GENERATION, "bg-muted-orange"],
  [$Enums.ObservationType.EVENT, "bg-muted-green"],
  ["TRACE", "bg-input"],
]);

export function nestObservations(
  list: ObservationReturnType[],
): NestedObservation[] {
  if (list.length === 0) return [];

  // Step 0: Sort the list by start time to ensure observations are in right order
  const sortedObservations = list.sort(
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

  // TODO sum token amounts per level

  // Step 5: Return the roots.
  return Array.from(roots.values());
}
