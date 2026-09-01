import type { FilterState } from "@langfuse/shared";

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

function partitionNoneOfEnvironmentValues(params: {
  values: string[];
  hiddenEnvironments: string[];
}): {
  extras: string[];
  hiddenInValues: string[];
  excludesAllHidden: boolean;
} {
  const { values, hiddenEnvironments } = params;
  const hiddenSet = new Set(hiddenEnvironments);
  const extras = values.filter((value) => !hiddenSet.has(value));
  const hiddenInValues = values.filter((value) => hiddenSet.has(value));
  const valueSet = new Set(values);

  return {
    extras,
    hiddenInValues,
    excludesAllHidden:
      hiddenEnvironments.length > 0 &&
      hiddenEnvironments.every((environment) => valueSet.has(environment)),
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
//
// A `none of [hidden ∪ extras]` exclusion is the same default plus the user's
// extra unchecked values (unchecking production from the implicit default).
// Persist only the extras so the search bar shows the non-default values
// (`-environment:production`) instead of burying them in the hidden-env list.
function canonicalizeNoneOfEnvironmentFilter(params: {
  envFilter: EnvironmentFilter;
  hiddenEnvironments: string[];
}): EnvironmentFilter | null {
  const { envFilter, hiddenEnvironments } = params;

  if (envFilter.operator !== "none of") {
    return envFilter;
  }

  if (hiddenEnvironments.length === 0) {
    return envFilter.value.length === 0 ? null : envFilter;
  }

  const { extras, excludesAllHidden } = partitionNoneOfEnvironmentValues({
    values: envFilter.value,
    hiddenEnvironments,
  });

  if (!excludesAllHidden) {
    return envFilter;
  }

  if (extras.length === 0) {
    return null;
  }

  return { ...envFilter, value: extras };
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
  const canonical = canonicalizeNoneOfEnvironmentFilter({
    envFilter,
    hiddenEnvironments,
  });

  if (canonical === envFilter) {
    return explicitFilters;
  }

  return explicitFilters.flatMap((filter) => {
    if (filter !== envFilter) return [filter];
    return canonical === null ? [] : [canonical];
  });
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

  if (envFilter.operator === "none of" && hiddenEnvironments.length > 0) {
    const { extras, hiddenInValues } = partitionNoneOfEnvironmentValues({
      values: envFilter.value,
      hiddenEnvironments,
    });

    // Extras-only form (`none of [production]`): fold the implicit hidden
    // exclusions back in so queries still hide internal environments.
    if (hiddenInValues.length === 0 && extras.length > 0) {
      return [
        {
          ...envFilter,
          value: [...hiddenEnvironments, ...extras],
        },
      ];
    }
  }

  return [envFilter];
}
