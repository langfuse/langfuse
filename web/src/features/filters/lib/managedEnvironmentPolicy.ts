import type { FilterState } from "@langfuse/shared";
import { computeSelectedValues } from "./filter-query-encoding";
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

function isEquivalentToImplicitEnvironmentDefault(params: {
  envFilter: EnvironmentFilter;
  hiddenEnvironments: string[];
  availableEnvironmentValues: string[];
}): boolean {
  const { envFilter, hiddenEnvironments, availableEnvironmentValues } = params;

  if (hiddenEnvironments.length === 0) return false;

  const exactDefaultMatch =
    envFilter.operator === "none of" &&
    areStringSetsEqual(envFilter.value, hiddenEnvironments);

  if (exactDefaultMatch) return true;

  if (availableEnvironmentValues.length === 0) return false;

  const selectedFromFilter = computeSelectedValues(
    availableEnvironmentValues,
    envFilter,
  );
  const hiddenSet = new Set(hiddenEnvironments);
  const selectedFromDefault = availableEnvironmentValues.filter(
    (value) => !hiddenSet.has(value),
  );

  return areStringSetsEqual(selectedFromFilter, selectedFromDefault);
}

export function stripImplicitEnvironmentFilterFromExplicitState(params: {
  explicitFilters: FilterState;
  availableEnvironmentValues: string[];
  config: ManagedEnvironmentPolicyConfig;
}): FilterState {
  const { explicitFilters, availableEnvironmentValues, config } = params;
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
      availableEnvironmentValues,
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
