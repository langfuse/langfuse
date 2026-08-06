import { type NestedObservation } from "@/src/utils/types";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { formatIntervalSeconds } from "@/src/utils/dates";
import Decimal from "decimal.js";
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

export const heatMapTextColor = (p: {
  min?: Decimal | number;
  max: Decimal | number;
  value: Decimal | number;
}) => {
  const { min, max, value } = p;
  const minDecimal = min ? new Decimal(min) : new Decimal(0);
  const maxDecimal = new Decimal(max);
  const valueDecimal = new Decimal(value);

  const cutOffs: [number, string][] = [
    [0.75, "text-dark-red"], // 75%
    [0.5, "text-dark-yellow"], // 50%
  ];
  const standardizedValueOnStartEndScale = valueDecimal
    .sub(minDecimal)
    .div(maxDecimal.sub(minDecimal));
  const ratio = standardizedValueOnStartEndScale.toNumber();

  // pick based on ratio if threshold is exceeded
  for (const [threshold, color] of cutOffs) {
    if (ratio >= threshold) {
      return color;
    }
  }
  return "";
};

/**
 * Decides whether a node's subtree wall-clock duration should be shown as a
 * distinct badge alongside its own-span duration (LFE-10475), and returns that
 * duration (ms) when it should.
 *
 * Async children can outlive their parent span, so a parent's own
 * (endTime − startTime) can understate the real elapsed time of its subtree.
 * The subtree always contains the own span, so it can only be ≥ own. We surface
 * the badge on any difference that is visible at the rendered precision — i.e.
 * when the subtree would display a different value than the own span. This shows
 * every difference the user can actually see (down to the formatter's 0.01s
 * resolution) while never rendering two identical-looking numbers. Users who
 * don't want durations at all can hide them via the "show duration" toggle.
 *
 * A missing own-span duration is treated as 0 so that nodes without a recorded
 * end still surface a meaningful subtree duration.
 *
 * @param ownDurationMs - the node's own span duration (endTime − startTime), ms
 * @param subtreeWallClockDurationMs - max(end) − min(start) across the subtree, ms
 */
export function getSubtreeDurationOverflowMs(
  ownDurationMs: number | undefined | null,
  subtreeWallClockDurationMs: number | undefined | null,
): number | null {
  if (subtreeWallClockDurationMs == null) return null;
  const own = ownDurationMs ?? 0;
  if (subtreeWallClockDurationMs <= own) return null;
  if (
    formatIntervalSeconds(subtreeWallClockDurationMs / 1000) ===
    formatIntervalSeconds(own / 1000)
  )
    return null;
  return subtreeWallClockDurationMs;
}
