import type { FilterState } from "@langfuse/shared";
import { areStringSetsEqual } from "./stringSetUtils";

type EnvironmentFilter = Extract<
  FilterState[number],
  { type: "stringOptions" }
>;

export type ManagedEnvironmentPolicyInput = {
  hiddenEnvironments?: readonly string[];
  managedEnvironmentColumn?: string;
  /**
   * Filter columns (id and display-name forms) that express experiment
   * intent. A positive filter on one of these reveals
   * `experimentEnvironments` from the hidden set — see
   * `resolveHiddenEnvironments`.
   */
  experimentFilterColumns?: readonly string[];
  /**
   * Hidden environments that experiment-enriched rows live in. The SDKs stamp
   * these environments together with the experiment fields, so keeping them
   * hidden while an experiment filter is active would make that filter
   * unsatisfiable (LFE-10644).
   */
  experimentEnvironments?: readonly string[];
};

export type ManagedEnvironmentPolicyConfig = {
  hiddenEnvironments: string[];
  managedEnvironmentColumn: string;
  experimentFilterColumns: string[];
  experimentEnvironments: string[];
};

export function buildManagedEnvironmentPolicyConfig(
  input?: ManagedEnvironmentPolicyInput,
): ManagedEnvironmentPolicyConfig {
  return {
    managedEnvironmentColumn: input?.managedEnvironmentColumn ?? "environment",
    hiddenEnvironments: Array.from(new Set(input?.hiddenEnvironments ?? [])),
    experimentFilterColumns: Array.from(
      new Set(input?.experimentFilterColumns ?? []),
    ),
    experimentEnvironments: Array.from(
      new Set(input?.experimentEnvironments ?? []),
    ),
  };
}

// Operators that express positive intent ("show me rows matching X").
// Negative shapes (`none of`, `does not contain`, `is null`) hide experiment
// rows, so they keep the default hidden-environment exclusion.
const POSITIVE_FILTER_OPERATORS: ReadonlySet<string> = new Set([
  "any of",
  "all of",
  "=",
  "contains",
  "starts with",
  "ends with",
  "is not null",
]);

function hasPositiveExperimentFilter(
  filters: FilterState,
  config: ManagedEnvironmentPolicyConfig,
): boolean {
  if (config.experimentFilterColumns.length === 0) return false;

  const experimentColumns = new Set(config.experimentFilterColumns);
  return filters.some(
    (filter) =>
      experimentColumns.has(filter.column) &&
      POSITIVE_FILTER_OPERATORS.has(filter.operator),
  );
}

/**
 * The hidden-environment set that applies GIVEN the rest of the filter state.
 * Experiment-enriched events carry the experiment environments on every row
 * (the SDKs propagate them together), so a positive experiment filter reveals
 * those environments — otherwise the combination can never match anything.
 */
function resolveHiddenEnvironments(
  filters: FilterState,
  config: ManagedEnvironmentPolicyConfig,
): string[] {
  if (!hasPositiveExperimentFilter(filters, config)) {
    return config.hiddenEnvironments;
  }

  return liftedHiddenEnvironments(config);
}

/** Hidden environments minus the experiment-revealed ones. */
function liftedHiddenEnvironments(
  config: ManagedEnvironmentPolicyConfig,
): string[] {
  const revealed = new Set(config.experimentEnvironments);
  return config.hiddenEnvironments.filter((env) => !revealed.has(env));
}

// Only SYSTEM-shaped exclusions — the `none of [hidden]` filter the sidebar
// auto-derives (in its full or experiment-lifted form), which the facet also
// re-creates when the user clears back to the default selection — count as
// "no real filter" and are stripped before persistence / re-canonicalized in
// effective state. A user-authored POSITIVE selection (`any of [...]`, e.g.
// typed in the search bar or stored in a saved view) is NEVER touched, even
// when it happens to select exactly the current default set: if the user
// committed to a value we keep it explicit and visible. Returning to the
// default is the user's action (remove the filter / uncheck back to default),
// not something we infer.
function isSystemShapedEnvironmentFilter(params: {
  envFilter: EnvironmentFilter;
  config: ManagedEnvironmentPolicyConfig;
}): boolean {
  const { envFilter, config } = params;

  if (config.hiddenEnvironments.length === 0) return false;
  if (envFilter.operator !== "none of") return false;

  if (areStringSetsEqual(envFilter.value, config.hiddenEnvironments)) {
    return true;
  }

  // The experiment-lifted form leaks back through updateFilter (which feeds
  // EFFECTIVE state into setFilterState), so it must be recognized as
  // system-shaped too — including after the experiment filter was removed.
  if (config.experimentEnvironments.length === 0) return false;
  return areStringSetsEqual(envFilter.value, liftedHiddenEnvironments(config));
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

  if (isSystemShapedEnvironmentFilter({ envFilter, config })) {
    return otherFilters;
  }
  return explicitFilters;
}

export function buildImplicitEnvironmentFilter(params: {
  explicitFilters: FilterState;
  config: ManagedEnvironmentPolicyConfig;
}): FilterState {
  const { explicitFilters, config } = params;
  const { managedEnvironmentColumn } = config;

  if (config.hiddenEnvironments.length === 0) return [];

  const hasExplicitEnvironmentFilter = explicitFilters.some(
    (filter) => filter.column === managedEnvironmentColumn,
  );

  if (hasExplicitEnvironmentFilter) return [];

  const hiddenEnvironments = resolveHiddenEnvironments(explicitFilters, config);
  if (hiddenEnvironments.length === 0) return [];

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

  // A system-shaped exclusion can arrive explicitly (e.g. materialized into a
  // shared URL). Re-canonicalize it so it adapts to experiment intent exactly
  // like the implicit default instead of making the filter unsatisfiable.
  if (isSystemShapedEnvironmentFilter({ envFilter, config })) {
    const hiddenEnvironments = resolveHiddenEnvironments(
      explicitFilters,
      config,
    );
    if (hiddenEnvironments.length === 0) return [];

    return [
      {
        column: managedEnvironmentColumn,
        type: "stringOptions" as const,
        operator: "none of" as const,
        value: hiddenEnvironments,
      },
    ];
  }

  return [envFilter];
}
