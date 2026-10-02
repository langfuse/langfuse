import type { FilterState } from "@langfuse/shared";
import isEqual from "lodash/isEqual";

function sameField(left: FilterState[number], right: FilterState[number]) {
  return (
    left.column === right.column &&
    ("key" in left ? left.key : null) === ("key" in right ? right.key : null)
  );
}

function matchFilterIndices(
  previousFilters: FilterState,
  nextFilters: FilterState,
) {
  const matched = new Set<number>();
  const matches = new Map<number, number>();
  const match = (nextIndex: number, previousIndex: number) => {
    if (previousIndex < 0) return;
    matched.add(previousIndex);
    matches.set(nextIndex, previousIndex);
  };

  // Sidebar removals retain object identity, which distinguishes identical
  // conditions assigned to different runs. Grammar commits reconstruct objects.
  nextFilters.forEach((filter, nextIndex) => {
    match(
      nextIndex,
      previousFilters.findIndex(
        (previous, index) => !matched.has(index) && previous === filter,
      ),
    );
  });
  nextFilters.forEach((filter, nextIndex) => {
    if (matches.has(nextIndex)) return;
    match(
      nextIndex,
      previousFilters.findIndex(
        (previous, index) => !matched.has(index) && isEqual(previous, filter),
      ),
    );
  });
  nextFilters.forEach((filter, nextIndex) => {
    if (matches.has(nextIndex)) return;
    const previousCandidates = previousFilters.flatMap((previous, index) =>
      !matched.has(index) && sameField(previous, filter) ? [index] : [],
    );
    const nextCandidates = nextFilters.filter(
      (next, index) => !matches.has(index) && sameField(next, filter),
    );
    if (previousCandidates.length === 1 && nextCandidates.length === 1) {
      match(nextIndex, previousCandidates[0]!);
    }
  });

  return { matched, matches };
}

/** Keep run assignments attached to conditions when editors reorder, remove or replace them. */
export function reconcileFilterTargets(
  previousFilters: FilterState,
  nextFilters: FilterState,
  targets: Readonly<Record<number, string>>,
): Record<number, string> {
  const { matched, matches } = matchFilterIndices(previousFilters, nextFilters);
  const nextTargets: Record<number, string> = {};
  for (const [nextIndex, previousIndex] of matches) {
    const target = targets[previousIndex];
    if (target !== undefined) nextTargets[nextIndex] = target;
  }
  nextFilters.forEach((filter, nextIndex) => {
    if (matches.has(nextIndex)) return;
    const previousCandidates = previousFilters.flatMap((previous, index) =>
      !matched.has(index) && sameField(previous, filter) ? [index] : [],
    );
    const nextCount = nextFilters.filter(
      (next, index) => !matches.has(index) && sameField(next, filter),
    ).length;
    const candidateTargets = new Set(
      previousCandidates.map((index) => targets[index]),
    );
    if (nextCount <= previousCandidates.length && candidateTargets.size === 1) {
      const target = targets[previousCandidates[0]!];
      if (target !== undefined) nextTargets[nextIndex] = target;
    }
  });
  return nextTargets;
}

/** Reject grammar changes that cannot preserve a condition's experiment assignment. */
export function hasAmbiguousTargetChange(
  previousFilters: FilterState,
  nextFilters: FilterState,
  targets: Readonly<Record<number, string>>,
  defaultTarget: string | undefined,
): boolean {
  const removedDuplicate = previousFilters.some((filter) => {
    const previousIndices = previousFilters.flatMap((previous, index) =>
      isEqual(previous, filter) ? [index] : [],
    );
    const remaining = nextFilters.filter((next) =>
      isEqual(next, filter),
    ).length;
    return (
      remaining > 0 &&
      remaining < previousIndices.length &&
      new Set(previousIndices.map((index) => targets[index] ?? defaultTarget))
        .size > 1
    );
  });
  if (removedDuplicate) return true;

  const { matched, matches } = matchFilterIndices(previousFilters, nextFilters);
  return nextFilters.some((filter, nextIndex) => {
    if (matches.has(nextIndex)) return false;
    const previousCandidates = previousFilters.flatMap((previous, index) =>
      !matched.has(index) && sameField(previous, filter) ? [index] : [],
    );
    const candidateTargets = new Set(
      previousCandidates.map((index) => targets[index] ?? defaultTarget),
    );
    const nextCount = nextFilters.filter(
      (next, index) => !matches.has(index) && sameField(next, filter),
    ).length;
    return (
      candidateTargets.size > 1 ||
      (nextCount > previousCandidates.length &&
        [...candidateTargets].some((target) => target !== defaultTarget))
    );
  });
}
