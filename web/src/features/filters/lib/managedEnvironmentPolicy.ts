import type { FilterState } from "@langfuse/shared";
import { computeSelectedValues } from "./filter-query-encoding";

type EnvironmentFilter = Extract<
  FilterState[number],
  { type: "stringOptions" }
>;

export type ManagedEnvironmentPolicyInput = {
  hiddenEnvironments?: string[];
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

function areStringSetsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  if (leftSet.size !== new Set(right).size) return false;
  return right.every((value) => leftSet.has(value));
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

export function isHiddenEnvironmentDeltaFilter(
  envFilter: EnvironmentFilter,
  hiddenEnvironments: string[],
): boolean {
  // Legacy URL behavior (kept for backwards compatibility):
  // when hidden envs were enabled explicitly, URL stored:
  //   environment any-of [enabledHiddenOnly]
  // Example (hidden set: [langfuse-prompt-experiment, langfuse-evaluation, sdk-experiment]):
  //   operator=any of, value=["langfuse-evaluation"]
  // This meant: "show normal envs + langfuse-evaluation".
  if (envFilter.operator !== "any of") return false;
  const hiddenSet = new Set(hiddenEnvironments);
  return envFilter.value.every((value) => hiddenSet.has(value));
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

  const hiddenSet = new Set(hiddenEnvironments);
  const isAnyOfHiddenOnlySelection =
    envFilter.operator === "any of" &&
    envFilter.value.length > 0 &&
    envFilter.value.every((value) => hiddenSet.has(value));

  if (isAnyOfHiddenOnlySelection && availableEnvironmentValues.length > 0) {
    // User explicitly selected only hidden env(s) (e.g. using "Only" action).
    // Canonicalize to none-of complement so effective behavior remains
    // "show only these hidden env(s)" and does not trigger legacy delta expansion.
    const deselected = availableEnvironmentValues.filter(
      (value) => !envFilter.value.includes(value),
    );

    if (deselected.length === 0) {
      return explicitFilters;
    }

    return [
      ...otherFilters,
      {
        column: managedEnvironmentColumn,
        type: "stringOptions" as const,
        operator: "none of" as const,
        value: deselected,
      },
    ];
  }

  if (isHiddenEnvironmentDeltaFilter(envFilter, hiddenEnvironments)) {
    // Preserve old shared links as-is in explicit state.
    // Example old URL filter:
    //   environment any-of ["langfuse-evaluation"]
    // Effective behavior is handled later in buildEffectiveEnvironmentFilter.
    return explicitFilters;
  }

  if (availableEnvironmentValues.length === 0) {
    return explicitFilters;
  }

  const selectedFromFilter = computeSelectedValues(
    availableEnvironmentValues,
    envFilter,
  );
  const nonHiddenValues = availableEnvironmentValues.filter(
    (value) => !hiddenSet.has(value),
  );
  const allNonHiddenSelected = nonHiddenValues.every((value) =>
    selectedFromFilter.includes(value),
  );

  if (!allNonHiddenSelected) {
    return explicitFilters;
  }

  const enabledHidden = hiddenEnvironments.filter((value) =>
    selectedFromFilter.includes(value),
  );

  const disabledHidden = hiddenEnvironments.filter(
    (value) => !enabledHidden.includes(value),
  );

  if (disabledHidden.length === hiddenEnvironments.length) {
    return otherFilters;
  }

  if (disabledHidden.length === 0) {
    // Keep explicit all-selected state because this is a user override to
    // include hidden environments. It is not equivalent to default/unfiltered.
    return explicitFilters;
  }

  return [
    ...otherFilters,
    {
      column: managedEnvironmentColumn,
      type: "stringOptions" as const,
      operator: "none of" as const,
      value: disabledHidden,
    },
  ];
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
  const { managedEnvironmentColumn, hiddenEnvironments } = config;

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

  if (!isHiddenEnvironmentDeltaFilter(envFilter, hiddenEnvironments)) {
    return [envFilter];
  }

  // Legacy expansion path:
  // Convert old delta shape "any-of enabledHiddenOnly" into current effective shape
  // "none-of disabledHidden".
  // Example:
  //   hidden=[langfuse-prompt-experiment, langfuse-evaluation, sdk-experiment]
  //   explicit any-of ["langfuse-evaluation"]
  //   => effective none-of ["langfuse-prompt-experiment", "sdk-experiment"]
  const disabledHiddenEnvironments = hiddenEnvironments.filter(
    (value) => !envFilter.value.includes(value),
  );

  if (disabledHiddenEnvironments.length === 0) {
    return [];
  }

  return [
    {
      column: managedEnvironmentColumn,
      type: "stringOptions" as const,
      operator: "none of" as const,
      value: disabledHiddenEnvironments,
    },
  ];
}
