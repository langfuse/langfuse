import type { FilterState } from "@langfuse/shared";

/** Resolve symbolic targets only when building the experiment request. */
export function groupExperimentFilters(
  filters: FilterState,
  baselineId: string | undefined,
  experimentIds: readonly string[],
): { groups: { runId: string; filters: FilterState }[]; error?: string } {
  const groups = new Map<string, FilterState>();
  for (const filter of filters) {
    const id =
      !filter.target || filter.target === "baseline"
        ? baselineId
        : filter.target;
    if (!id || !experimentIds.includes(id)) {
      return {
        groups: [],
        error:
          "A filter targets an unavailable experiment. Select a baseline, restore the experiment, or edit the filter target.",
      };
    }
    const { target: _target, ...condition } = filter;
    const group = groups.get(id) ?? [];
    group.push(condition);
    groups.set(id, group);
  }
  return {
    groups: Array.from(groups, ([runId, filters]) => ({ runId, filters })),
  };
}
