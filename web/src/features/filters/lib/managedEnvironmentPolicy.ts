import type { FilterState } from "@langfuse/shared";
import { areStringSetsEqual } from "./stringSetUtils";

type EnvironmentFilter = Extract<
  FilterState[number],
  { type: "stringOptions" }
>;

export type ManagedEnvironmentPolicyInput = {
  hiddenEnvironments?: readonly string[];
  managedEnvironmentColumn?: string;
};

export type ManagedEnvironmentPolicyConfig = {
  hiddenEnvironments: string[];
  managedEnvironmentColumn: string;
};

export function buildManagedEnvironmentPolicyConfig(
  input?: ManagedEnvironmentPolicyInput,
): ManagedEnvironmentPolicyConfig {
  return {
    managedEnvironmentColumn: input?.managedEnvironmentColumn ?? "environment",
    hiddenEnvironments: Array.from(new Set(input?.hiddenEnvironments ?? [])),
  };
}

// Only the SYSTEM-shaped implicit default — the `none of [hidden]` filter the
// sidebar auto-derives, and that the facet re-creates when the user clears back
// to the default selection — counts as "no real filter" and is stripped before
// persistence. A user-authored POSITIVE selection (`any of [...]`, e.g. typed in
// the search bar or stored in a saved view) is NEVER stripped, even when it
// happens to select exactly the current default set: if the user committed to a
// value we keep it explicit and visible. Returning to the default is the user's
// action (remove the filter / uncheck back to default), not something we infer.
function isEquivalentToImplicitEnvironmentDefault(params: {
  envFilter: EnvironmentFilter;
  hiddenEnvironments: string[];
}): boolean {
  const { envFilter, hiddenEnvironments } = params;

  if (hiddenEnvironments.length === 0) return false;

  return (
    envFilter.operator === "none of" &&
    areStringSetsEqual(envFilter.value, hiddenEnvironments)
  );
}

export function stripImplicitEnvironmentFilterFromExplicitState(params: {
  explicitFilters: FilterState;
  config: ManagedEnvironmentPolicyConfig;
}): FilterState {
  const { explicitFilters, config } = params;
  const { managedEnvironmentColumn, hiddenEnvironments } = config;

  if (hiddenEnvironments.length === 0) return explicitFilters;

  const managedColumnFilters = explicitFilters.filter(
    (filter) => filter.column === managedEnvironmentColumn,
  );

  // Only canonicalize the standard environment checkbox filter shape.
  if (
    managedColumnFilters.length !== 1 ||
    managedColumnFilters[0]?.type !== "stringOptions"
  ) {
    return explicitFilters;
  }

  const envFilter = managedColumnFilters[0] as EnvironmentFilter;
  const otherFilters = explicitFilters.filter((filter) => filter !== envFilter);

  if (
    isEquivalentToImplicitEnvironmentDefault({
      envFilter,
      hiddenEnvironments,
    })
  ) {
    return otherFilters;
  }
  return explicitFilters;
}

export function buildImplicitEnvironmentFilter(params: {
  explicitFilters: FilterState;
  config: ManagedEnvironmentPolicyConfig;
}): FilterState {
  const { explicitFilters, config } = params;
  const { managedEnvironmentColumn, hiddenEnvironments } = config;

  if (hiddenEnvironments.length === 0) return [];

  const hasExplicitEnvironmentFilter = explicitFilters.some(
    (filter) => filter.column === managedEnvironmentColumn,
  );

  if (hasExplicitEnvironmentFilter) return [];

  return [
    {
      column: managedEnvironmentColumn,
      type: "stringOptions" as const,
      operator: "none of" as const,
      value: hiddenEnvironments,
    },
  ];
}

export function buildEffectiveEnvironmentFilter(params: {
  explicitFilters: FilterState;
  config: ManagedEnvironmentPolicyConfig;
}): FilterState {
  const { explicitFilters, config } = params;
  const { managedEnvironmentColumn } = config;

  const managedColumnFilters = explicitFilters.filter(
    (filter) => filter.column === managedEnvironmentColumn,
  );

  if (managedColumnFilters.length === 0) {
    return buildImplicitEnvironmentFilter({
      explicitFilters,
      config,
    });
  }

  if (
    managedColumnFilters.length !== 1 ||
    managedColumnFilters[0]?.type !== "stringOptions"
  ) {
    return managedColumnFilters;
  }

  const envFilter = managedColumnFilters[0] as EnvironmentFilter;
  return [envFilter];
}
