import type { FilterState } from "@langfuse/shared";
import isEqual from "lodash/isEqual";

/** Resolve symbolic targets only when building the experiment request. */
export function groupExperimentFilters(
  filters: FilterState,
  baselineId: string | undefined,
  experimentIds: readonly string[],
): { groups: { runId: string; filters: FilterState }[]; error?: string } {
  const groups = new Map<string, FilterState>();
  for (const filter of filters) {
    let targetId: string | undefined =
      filter.target ?? baselineId ?? experimentIds[0];
    if (filter.target === "baseline") targetId = baselineId;
    const ids = filter.target === "all" ? experimentIds : [targetId];
    if (ids.some((id) => !id || !experimentIds.includes(id))) {
      return {
        groups: [],
        error:
          "A filter targets an unavailable experiment. Select a baseline, restore the experiment, or edit the filter target.",
      };
    }
    const { target: _target, ...condition } = filter;
    for (const id of ids) {
      if (!id) continue;
      const group = groups.get(id) ?? [];
      group.push(condition);
      groups.set(id, group);
    }
  }
  return {
    groups: Array.from(groups, ([runId, filters]) => ({ runId, filters })),
  };
}

export function getExperimentBatchEvaluationFilters(
  groups: { runId: string; filters: FilterState }[],
  experimentIds: readonly string[],
  selectAll: boolean,
): FilterState | null {
  // Explicit selections are constrained by their observation IDs in the dialog.
  if (!selectAll) return [];

  // Batch evaluation accepts one conjunction, not experiment-qualified groups.
  const filtersByRun = new Map(
    groups.map((group) => [group.runId, group.filters]),
  );
  const commonFilters = filtersByRun.get(experimentIds[0] ?? "") ?? [];
  return experimentIds.every((id) =>
    isEqual(filtersByRun.get(id) ?? [], commonFilters),
  )
    ? commonFilters
    : null;
}
