import type React from "react";
import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import {
  StringParam,
  useQueryParam,
  type UrlUpdateType,
} from "use-query-params";
import {
  type FilterState,
  singleFilter,
  type SingleValueOption,
  type ColumnDefinition,
} from "@langfuse/shared";
import {
  computeSelectedValues,
  encodeFiltersGeneric,
  decodeFiltersGeneric,
  MAX_URL_FILTER_QUERY_LENGTH,
} from "../lib/filter-query-encoding";
import {
  buildSidebarFilterQueryStorageKey,
  createPersistedSidebarFilterQueryState,
  getPersistedSidebarFilterQueryForContext,
  type PersistedSidebarFilterQueryState,
} from "../lib/persistedSidebarFilterQuery";
import { normalizeFilterColumnNames } from "../lib/filter-transform";
import {
  buildEffectiveEnvironmentFilter,
  buildManagedEnvironmentPolicyConfig,
  stripImplicitEnvironmentFilterFromExplicitState,
  type ManagedEnvironmentPolicyInput,
} from "../lib/managedEnvironmentPolicy";
import { useKeyedSessionStorageState } from "./useKeyedSessionStorageState";
import useSessionStorage from "@/src/components/useSessionStorage";
import type { FilterConfig, FilterStateMigration } from "../lib/filter-config";
import {
  addTextFilterEntry,
  applyCheckboxSelection,
  applyKeyedFilterEntries,
  applyNumericRange,
  applyStringContains,
  buildOnlySelection,
  clearCategoricalColumn,
  deriveOperatorChange,
  removeColumnFiltersOfType,
  removeTextFilterEntry,
  type BooleanKeyValueFilterEntry,
  type KeyValueFilterEntry,
  type KeyedFilterKind,
  type NumericKeyValueFilterEntry,
  type SidebarFilterActionContext,
  type StringKeyValueFilterEntry,
} from "../lib/sidebar-filter-actions";

// Re-exported so existing consumers (tests, session view) keep their path.
export { resolveCheckboxOperator } from "../lib/sidebar-filter-actions";
import type { PeekTableStateContextValue } from "@/src/components/table/peek/contexts/PeekTableStateContext";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/**
 * Decodes filters from URL query string and normalizes display names to column IDs.
 * This prevents duplicates when old URLs use display names and new filters use column IDs.
 *
 * @param filtersQuery - Encoded filter string from URL
 * @param columnDefinitions - Column definitions for validation and normalization
 * @returns Normalized and validated FilterState
 */
export function decodeAndNormalizeFilters(
  filtersQuery: string,
  columnDefinitions: ColumnDefinition[],
  migrateFilterState?: FilterStateMigration,
): FilterState {
  try {
    const filters = decodeFiltersGeneric(filtersQuery);
    const knownColumns = new Map<string, string>();
    for (const columnDefinition of columnDefinitions) {
      knownColumns.set(columnDefinition.id, columnDefinition.id);
      knownColumns.set(columnDefinition.name, columnDefinition.id);
      // Map old column IDs to current canonical ID for backward compat
      for (const alias of columnDefinition.aliases ?? []) {
        knownColumns.set(alias, columnDefinition.id);
      }
    }

    // Normalize display names to column IDs immediately after decoding
    // This prevents duplicates when old URLs use display names (e.g., "Environment")
    // and user adds new filters with column IDs (e.g., "environment")
    const normalized = normalizeFilterColumnNames(filters, columnDefinitions);
    const migrated = migrateFilterState
      ? migrateFilterState(normalized)
      : normalized;

    // Validate normalized filters
    const result: FilterState = [];
    for (const filter of migrated) {
      const validationResult = singleFilter.safeParse(filter);
      if (validationResult.success) {
        const canonicalColumnId = knownColumns.get(
          validationResult.data.column,
        );
        if (!canonicalColumnId) {
          // Gracefully ignore stale filters from old URLs or saved state.
          continue;
        }

        result.push({
          ...validationResult.data,
          column: canonicalColumnId,
        });
      } else {
        console.warn(`Invalid filter skipped:`, filter, validationResult.error);
      }
    }
    return result;
  } catch (error) {
    console.error("Error decoding filters:", error);
    return [];
  }
}

function computeNumericRange(
  column: string,
  filterState: FilterState,
  defaultMin: number,
  defaultMax: number,
): [number, number] {
  const minFilter = filterState.find(
    (f) => f.column === column && f.type === "number" && f.operator === ">=",
  );
  const maxFilter = filterState.find(
    (f) => f.column === column && f.type === "number" && f.operator === "<=",
  );

  const minValue =
    minFilter && typeof minFilter.value === "number"
      ? minFilter.value
      : defaultMin;
  const maxValue =
    maxFilter && typeof maxFilter.value === "number"
      ? maxFilter.value
      : defaultMax;

  return [minValue, maxValue];
}

export interface BaseUIFilter {
  column: string;
  label: string;
  tooltip?: string;
  help?: {
    description: React.ReactNode;
    href?: string;
  };
  loading: boolean;
  expanded: boolean;
  isActive: boolean;
  isDisabled: boolean;
  disabledReason?: string;
  onReset: () => void;
}

/**
 * Represents one text filter entry (contains/does not contain)
 * Used for free-text filtering that's mutually exclusive with checkbox selection
 */
export type TextFilterEntry = {
  operator: "contains" | "does not contain";
  value: string;
};

export interface CategoricalUIFilter extends BaseUIFilter {
  type: "categorical";
  value: string[];
  options: string[];
  counts: Map<string, number>;
  displayByValue?: Map<string, string>;
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
  /** Optional function to render an icon next to filter option labels */
  renderIcon?: (value: string) => React.ReactNode;
  /**
   * Current operator of the facet's checkbox filter (arrayOptions AND
   * stringOptions columns; undefined when no filter is applied):
   * - "any of": OR logic - match if item has ANY selected value
   * - "all of": AND logic - match if item has ALL selected values (arrayOptions only)
   * - "none of": exclude items carrying an UNCHECKED value (the filter stores
   *   the exclusions; checkboxes display the kept complement)
   */
  operator?: "any of" | "all of" | "none of";
  /**
   * Raw stored exclusions of an active "none of" filter, INCLUDING carried
   * exclusions outside the current (time-scoped, top-N-capped) option list
   * that the checked=kept checkbox display cannot show (LFE-10717).
   * Display-only — lets the facet header summary report the whole filter
   * instead of just its visible part.
   */
  excludedValues?: string[];
  /**
   * Callback to change the operator. Only provided for arrayOptions columns.
   * When called, updates the filter to use the specified operator.
   */
  onOperatorChange?: (operator: "any of" | "all of" | "none of") => void;
  /**
   * Active text filters (contains/does not contain) for this column
   * Mutually exclusive with checkbox selections
   */
  textFilters?: TextFilterEntry[];
  // Add a new text filter. Automatically clears checkbox selections.
  onTextFilterAdd?: (
    operator: "contains" | "does not contain",
    value: string,
  ) => void;
  // Remove a text filter by operator and value
  onTextFilterRemove?: (
    operator: "contains" | "does not contain",
    value: string,
  ) => void;
}

export interface NumericUIFilter extends BaseUIFilter {
  type: "numeric";
  value: [number, number];
  min: number;
  max: number;
  onChange: (value: [number, number]) => void;
  unit?: string;
}

export interface StringUIFilter extends BaseUIFilter {
  type: "string";
  value: string;
  onChange: (value: string) => void;
}

// The keyed-facet row shapes live beside the pure state transitions in
// sidebar-filter-actions; re-exported here so existing consumers keep their
// import path.
export type {
  KeyValueFilterEntry,
  NumericKeyValueFilterEntry,
  BooleanKeyValueFilterEntry,
  StringKeyValueFilterEntry,
} from "../lib/sidebar-filter-actions";

export interface KeyValueUIFilter extends BaseUIFilter {
  type: "keyValue";
  value: KeyValueFilterEntry[]; // Array of active filter rows
  keyOptions?: string[];
  availableValues: Record<string, string[]>;
  onChange: (filters: KeyValueFilterEntry[]) => void;
}

export interface NumericKeyValueUIFilter extends BaseUIFilter {
  type: "numericKeyValue";
  value: NumericKeyValueFilterEntry[]; // Array of active filter rows
  keyOptions?: string[];
  onChange: (filters: NumericKeyValueFilterEntry[]) => void;
}

export interface BooleanKeyValueUIFilter extends BaseUIFilter {
  type: "booleanKeyValue";
  value: BooleanKeyValueFilterEntry[]; // Array of active filter rows
  keyOptions?: string[];
  onChange: (filters: BooleanKeyValueFilterEntry[]) => void;
}

export interface StringKeyValueUIFilter extends BaseUIFilter {
  type: "stringKeyValue";
  value: StringKeyValueFilterEntry[]; // Array of active filter rows
  keyOptions?: string[];
  onChange: (filters: StringKeyValueFilterEntry[]) => void;
}

export type UIFilter =
  | CategoricalUIFilter
  | NumericUIFilter
  | StringUIFilter
  | KeyValueUIFilter
  | NumericKeyValueUIFilter
  | BooleanKeyValueUIFilter
  | StringKeyValueUIFilter;

const EMPTY_MAP: Map<string, number> = new Map();

const mergeUniqueStrings = (...lists: (string[] | undefined)[]): string[] =>
  Array.from(
    new Set(
      lists.flatMap((list) => (list ?? []).filter((value) => value.length > 0)),
    ),
  );

const resolveKnownKeyOptions = (
  facetKeyOptions: string[] | undefined,
  availableKeys:
    | (string | SingleValueOption)[]
    | Record<string, string[]>
    | undefined,
  activeKeys: string[],
): string[] | undefined => {
  if (facetKeyOptions !== undefined) {
    return mergeUniqueStrings(facetKeyOptions, activeKeys);
  }

  if (!Array.isArray(availableKeys)) {
    return undefined;
  }

  return mergeUniqueStrings(
    availableKeys.map((option) =>
      typeof option === "string" ? option : option.value,
    ),
    activeKeys,
  );
};

const mergeAvailableValuesWithActiveFilters = (
  availableValues: Record<string, string[]>,
  activeFilters: KeyValueFilterEntry[],
): Record<string, string[]> => {
  const merged: Record<string, string[]> = { ...availableValues };

  for (const filter of activeFilters) {
    if (!filter.key) continue;
    merged[filter.key] = mergeUniqueStrings(merged[filter.key], filter.value);
  }

  return merged;
};

// extract values and counts from options array
// for both string[] and SingleValueOption[]
function processOptions(options: (string | SingleValueOption)[]): {
  values: string[];
  counts: Map<string, number>;
  displayByValue?: Map<string, string>;
} {
  const values: string[] = [];
  const counts = new Map<string, number>();
  const displayByValue = new Map<string, string>();

  for (const opt of options) {
    if (typeof opt === "string") {
      values.push(opt);
    } else if (typeof opt === "object" && "value" in opt) {
      values.push(opt.value);
      if (opt.count !== undefined) {
        counts.set(opt.value, opt.count);
      }
      if (
        typeof opt.displayValue === "string" &&
        opt.displayValue !== opt.value
      ) {
        displayByValue.set(opt.value, opt.displayValue);
      }
    }
  }

  return {
    values,
    counts: counts.size > 0 ? counts : EMPTY_MAP,
    displayByValue: displayByValue.size > 0 ? displayByValue : undefined,
  };
}

type UpdateFilter = (
  column: string,
  values: string[],
  operator?: "any of" | "none of" | "all of",
) => void;

type BaseUseSidebarFilterStateOptions = {
  loading?: boolean;
  implicitDefaultConfig?: ManagedEnvironmentPolicyInput;
  /** Explicit defaults are visible/editable but are not persisted until the user edits. */
  defaultExplicitFilterState?: FilterState;
  onExplicitFilterStateChange?: (params: {
    previousFilters: FilterState;
    nextFilters: FilterState;
    origin: "user" | "saved_view" | "system";
  }) => void;
  /**
   * Precise per-facet loading set (lazy filter-options): exactly the columns
   * whose options have been requested but not yet arrived. When provided it
   * drives the facet skeleton instead of the coarse `loading` flag, so a facet
   * shows a skeleton only while its own options stream in — and never for
   * columns that are not server-enumerated (e.g. metadata).
   */
  loadingColumns?: ReadonlySet<string>;
  /**
   * Whether this sidebar is rendered on a v4 (fast-mode / events-table) surface.
   * Drives the `isV4` dimension on the `filters:*` analytics events so we can
   * split filtering behaviour by v3-legacy vs v4-fast-mode. Defaults to false;
   * the v4 events table passes `true`. (The `v4BetaEnabled` super property set
   * in `_app.tsx` still segments every event globally as a backstop.)
   */
  isV4?: boolean;
};

export type UseSidebarFilterStateOptions =
  | (BaseUseSidebarFilterStateOptions & {
      stateLocation: "peekContext";
      context: PeekTableStateContextValue;
    })
  | (BaseUseSidebarFilterStateOptions & {
      stateLocation: "urlAndSessionStorage";
      /**
       * Optional context identifier (for example projectId) to guard against
       * carrying persisted filters across contexts.
       */
      sessionFilterContextId?: string | null;
    })
  | (BaseUseSidebarFilterStateOptions & { stateLocation: "url" })
  | (BaseUseSidebarFilterStateOptions & { stateLocation: "memory" });

const DEFAULT_HOOK_OPTIONS: UseSidebarFilterStateOptions = {
  stateLocation: "urlAndSessionStorage",
};

// The URL value a given serialized filter query should produce: oversized
// queries stay out of the URL entirely — the full request head is capped at
// ~16KB by Node and most proxies, so a giant `?filter=` 431s on the next full
// request (LFE-10717). Callers fall back to the session-storage mirror, which
// keeps same-tab refreshes working. Only used where that fallback exists
// (stateLocation "urlAndSessionStorage").
const toUrlFilterQuery = (encoded: string): string =>
  encoded.length > MAX_URL_FILTER_QUERY_LENGTH ? "" : encoded;

export function useSidebarFilterState(
  config: FilterConfig,
  options: Record<
    string,
    (string | SingleValueOption)[] | Record<string, string[]> | undefined
  >,
  hookOptions: UseSidebarFilterStateOptions = DEFAULT_HOOK_OPTIONS,
) {
  const {
    loading,
    loadingColumns,
    implicitDefaultConfig,
    onExplicitFilterStateChange,
  } = hookOptions;
  const isV4Surface = hookOptions.isV4 ?? false;
  const capture = usePostHogClientCapture();
  const stateLocationType = hookOptions.stateLocation;
  const peekContext =
    stateLocationType === "peekContext" ? hookOptions.context : undefined;
  const setPeekTableState = peekContext?.setTableState;

  const FILTER_EXPANDED_STORAGE_KEY = `${config.tableName}-filters-expanded`;
  // Tracks which active-filter columns we have already auto-expanded once, so a
  // section the user later collapsed is never re-expanded — even across remounts
  // (route navigation away-and-back, tab reload). It shares the session lifecycle
  // of the expanded state itself, so the "already reconciled" knowledge survives
  // exactly as long as the manual collapse it must respect. See LFE-10164 below.
  const FILTER_SEEDED_STORAGE_KEY = `${config.tableName}-filters-seeded`;
  const DEFAULT_EXPANDED_FILTERS = config.defaultExpanded ?? [];

  const [expandedString, setExpandedString] = useSessionStorage<string>(
    FILTER_EXPANDED_STORAGE_KEY,
    DEFAULT_EXPANDED_FILTERS.join(","),
  );
  const expandedState = useMemo(() => {
    return expandedString.split(",").filter(Boolean);
  }, [expandedString]);
  const onExpandedChange = useCallback(
    (value: string[]) => {
      setExpandedString(value.join(","));
    },
    [setExpandedString],
  );

  const [seededString, setSeededString] = useSessionStorage<string>(
    FILTER_SEEDED_STORAGE_KEY,
    "",
  );

  const normalizedSessionFilterContextId =
    stateLocationType === "urlAndSessionStorage"
      ? (hookOptions.sessionFilterContextId ?? null)
      : null;
  const FILTER_QUERY_SESSION_STORAGE_KEY = buildSidebarFilterQueryStorageKey({
    tableName: config.tableName,
    contextId: normalizedSessionFilterContextId,
  });

  const [storedFilterQueryState, setStoredFilterQueryState] =
    useKeyedSessionStorageState<PersistedSidebarFilterQueryState>(
      FILTER_QUERY_SESSION_STORAGE_KEY,
      createPersistedSidebarFilterQueryState(
        normalizedSessionFilterContextId,
        "",
      ),
    );

  const storedFiltersQuery = getPersistedSidebarFilterQueryForContext({
    state: storedFilterQueryState,
    contextId: normalizedSessionFilterContextId,
  });
  const setStoredFiltersQuery = useCallback(
    (query: string) => {
      setStoredFilterQueryState(
        createPersistedSidebarFilterQueryState(
          normalizedSessionFilterContextId,
          query,
        ),
      );
    },
    [setStoredFilterQueryState, normalizedSessionFilterContextId],
  );
  const [urlFiltersQuery, setUrlFiltersQuery] = useQueryParam(
    "filter",
    StringParam,
  );
  // Optimistic query state: prevents stale URL reads from overriding immediate
  // local changes while use-query-params updates the URL asynchronously.
  const [pendingFiltersQuery, setPendingFiltersQuery] = useState<string | null>(
    null,
  );
  const [memoryFilterState, setMemoryFilterState] = useState<FilterState>([]);

  const urlFilterState: FilterState = useMemo(() => {
    if (
      stateLocationType !== "url" &&
      stateLocationType !== "urlAndSessionStorage"
    ) {
      return [];
    }

    const rawQuery = (() => {
      if (pendingFiltersQuery !== null) {
        return pendingFiltersQuery;
      }

      if (typeof urlFiltersQuery === "string") {
        return urlFiltersQuery;
      }

      if (stateLocationType === "urlAndSessionStorage") {
        return storedFiltersQuery;
      }

      return "";
    })();

    return decodeAndNormalizeFilters(
      rawQuery,
      config.columnDefinitions,
      config.migrateFilterState,
    );
  }, [
    config.columnDefinitions,
    config.migrateFilterState,
    stateLocationType,
    pendingFiltersQuery,
    urlFiltersQuery,
    storedFiltersQuery,
  ]);

  const canonicalFiltersQuery = useMemo(
    () => encodeFiltersGeneric(urlFilterState),
    [urlFilterState],
  );

  const persistedExplicitFilterState: FilterState =
    stateLocationType === "peekContext"
      ? hookOptions.context.tableState.filters
      : stateLocationType === "memory"
        ? memoryFilterState
        : urlFilterState;

  const explicitFilterState = useMemo(() => {
    const defaultFilters = hookOptions.defaultExplicitFilterState ?? [];
    if (defaultFilters.length === 0) return persistedExplicitFilterState;

    const explicitlyOwnedColumns = new Set(
      persistedExplicitFilterState.map((filter) => filter.column),
    );
    return persistedExplicitFilterState.concat(
      defaultFilters.filter(
        (filter) => !explicitlyOwnedColumns.has(filter.column),
      ),
    );
  }, [hookOptions.defaultExplicitFilterState, persistedExplicitFilterState]);

  // LFE-10164: When arriving via a URL/deep link that already carries applied
  // filters, expand the sidebar sections that have an active filter. Sidebar
  // sections are collapsed by default; without this, a bookmarked/shared link
  // would render its active facets collapsed. Sections without an active filter
  // keep their default state.
  //
  // We derive this during render (the "adjust state while rendering when a
  // derived input changes" pattern, https://react.dev/learn/you-might-not-need-an-effect)
  // rather than in a mount effect. The mount-effect approach had two defects:
  //   1. Late-arriving URL params: in the Pages Router `useQueryParam` reads
  //      `router.query`, which is empty on the first render of a direct
  //      navigation and only populated on a later render. A one-shot mount
  //      effect seeded against the empty first render and never re-ran, so
  //      deep-linked sections stayed collapsed. Reconciling during render means
  //      the moment the filters actually appear (a later render) we seed them.
  //   2. Remount re-seed: a per-mount guard re-expanded a section the user had
  //      deliberately collapsed whenever the page remounted. We instead persist
  //      which columns have already been auto-expanded (`seededString`, same
  //      session lifecycle as the expanded state) and only expand columns that
  //      are newly active and not yet reconciled, so a collapsed section is
  //      never re-expanded.
  //
  // We key off `explicitFilterState` (the URL/memory/peek-authored filters),
  // which already excludes the implicit hidden-environment default — so the
  // managed-environment section is only auto-expanded when the user actually
  // authored an environment filter.
  const seededSet = useMemo(
    () => new Set(seededString.split(",").filter(Boolean)),
    [seededString],
  );
  const facetColumnSet = useMemo(
    () => new Set(config.facets.map((facet) => facet.column)),
    [config.facets],
  );
  const newlyActiveFacetColumns = explicitFilterState
    .map((filter) => filter.column)
    .filter((column) => facetColumnSet.has(column) && !seededSet.has(column));
  if (newlyActiveFacetColumns.length > 0) {
    // setState-during-render (not an effect): React discards this render and
    // re-renders synchronously with the updated state before painting. The
    // updates are idempotent — once a column is in `seededSet` it is no longer
    // "newly active", so this branch does not re-run for it on the next render.
    setExpandedString((current) => {
      const expanded = current.split(",").filter(Boolean);
      const expandedSet = new Set(expanded);
      const next = [...expanded];
      for (const column of newlyActiveFacetColumns) {
        if (!expandedSet.has(column)) {
          expandedSet.add(column);
          next.push(column);
        }
      }
      return next.length === expanded.length ? current : next.join(",");
    });
    setSeededString((current) => {
      const seeded = current.split(",").filter(Boolean);
      const seededColumnSet = new Set(seeded);
      const next = [...seeded];
      for (const column of newlyActiveFacetColumns) {
        if (!seededColumnSet.has(column)) {
          seededColumnSet.add(column);
          next.push(column);
        }
      }
      return next.length === seeded.length ? current : next.join(",");
    });
  }

  const managedEnvironmentPolicyConfig = useMemo(
    () => buildManagedEnvironmentPolicyConfig(implicitDefaultConfig),
    [implicitDefaultConfig],
  );

  const managedEnvironmentColumn =
    managedEnvironmentPolicyConfig.managedEnvironmentColumn;

  // Context the pure facet-action functions (lib/sidebar-filter-actions)
  // read: facet/column metadata, the option lists, and — only while the
  // managed-environment policy is active — the managed column, which gates
  // its explicit enable-all-environments override.
  const actionContext: SidebarFilterActionContext = useMemo(
    () => ({
      facets: config.facets,
      columnDefinitions: config.columnDefinitions,
      options,
      managedEnvironmentColumn:
        managedEnvironmentPolicyConfig.hiddenEnvironments.length > 0
          ? managedEnvironmentColumn
          : undefined,
    }),
    [
      config.facets,
      config.columnDefinitions,
      options,
      managedEnvironmentColumn,
      managedEnvironmentPolicyConfig.hiddenEnvironments,
    ],
  );

  const effectiveEnvironmentFilterState: FilterState = useMemo(
    () =>
      buildEffectiveEnvironmentFilter({
        explicitFilters: explicitFilterState,
        config: managedEnvironmentPolicyConfig,
      }),
    [explicitFilterState, managedEnvironmentPolicyConfig],
  );

  const filterState: FilterState = useMemo(
    () =>
      explicitFilterState
        .filter((filter) => filter.column !== managedEnvironmentColumn)
        .concat(effectiveEnvironmentFilterState),
    [
      explicitFilterState,
      effectiveEnvironmentFilterState,
      managedEnvironmentColumn,
    ],
  );

  // `options.updateType` controls the history semantics of the URL write:
  // user-initiated filter edits keep the default (push — a Back-able step);
  // programmatic writes (e.g. the session default-view auto-apply) pass
  // `replaceIn` so they don't mint a history entry Back would bounce off
  // (LFE-10715). Ignored for non-URL state locations.
  const setFilterState = useCallback(
    (
      newFilters: FilterState,
      options?: {
        updateType?: UrlUpdateType;
        origin?: "user" | "saved_view" | "system";
      },
    ) => {
      const explicitFilters = stripImplicitEnvironmentFilterFromExplicitState({
        explicitFilters: newFilters,
        config: managedEnvironmentPolicyConfig,
      });

      onExplicitFilterStateChange?.({
        previousFilters: explicitFilterState,
        nextFilters: explicitFilters,
        origin: options?.origin ?? "user",
      });

      if (stateLocationType === "peekContext" && setPeekTableState) {
        setPeekTableState((current) => ({
          ...current,
          filters: explicitFilters,
        }));
        return;
      }

      if (stateLocationType === "memory") {
        setMemoryFilterState(explicitFilters);
        return;
      }

      const encoded = encodeFiltersGeneric(explicitFilters);
      const urlQuery =
        stateLocationType === "urlAndSessionStorage"
          ? toUrlFilterQuery(encoded)
          : encoded;
      if (urlQuery !== encoded) {
        console.warn(
          `Filter state (${encoded.length} chars) exceeds the URL budget; persisting it in session storage only.`,
        );
      }
      setPendingFiltersQuery(encoded);
      // Eviction of an oversized state replaces the current history entry
      // regardless of the caller's updateType: repeated interactions in the
      // oversized regime must not push a stack of identical param-less
      // entries the Back button has to walk through.
      setUrlFiltersQuery(
        urlQuery || null,
        urlQuery !== encoded ? "replaceIn" : options?.updateType,
      );
      if (stateLocationType === "urlAndSessionStorage") {
        setStoredFiltersQuery(encoded);
      }
    },
    [
      stateLocationType,
      setPeekTableState,
      setUrlFiltersQuery,
      setStoredFiltersQuery,
      managedEnvironmentPolicyConfig,
      explicitFilterState,
      onExplicitFilterStateChange,
    ],
  );

  // Drop optimistic override once URL catches up to the requested value.
  useEffect(() => {
    if (
      stateLocationType !== "url" &&
      stateLocationType !== "urlAndSessionStorage"
    ) {
      return;
    }
    if (pendingFiltersQuery === null) return;

    const normalizedUrlFiltersQuery = urlFiltersQuery ?? "";
    // An oversized pending query is intentionally never written to the URL;
    // it has "caught up" once the URL param is gone (state then reads from
    // the session-storage mirror).
    const expectedUrlFiltersQuery =
      stateLocationType === "urlAndSessionStorage"
        ? toUrlFilterQuery(pendingFiltersQuery)
        : pendingFiltersQuery;
    if (normalizedUrlFiltersQuery === expectedUrlFiltersQuery) {
      setPendingFiltersQuery(null);
    }
  }, [stateLocationType, pendingFiltersQuery, urlFiltersQuery]);

  // Sanitize stale or outdated filter queries in URL/session state.
  // TODO(2026-04-15): Remove this entire effect once stale
  // positionInTrace traces-table URL/session state has aged out.
  // Remove the canonicalFiltersQuery cleanup path here and the matching
  // stale-positionInTrace migration tests in sidebarFilterSessionPersistence
  // / filter-integration when this is no longer needed.
  useEffect(() => {
    if (
      stateLocationType !== "url" &&
      stateLocationType !== "urlAndSessionStorage"
    ) {
      return;
    }

    if (pendingFiltersQuery !== null) return;

    if (typeof urlFiltersQuery === "string") {
      // Canonicalization also evicts an oversized query that arrived via the
      // URL (e.g. a legacy complement-filter link): it moves to the
      // session-storage mirror instead of being rewritten into the URL.
      const canonicalUrlQuery =
        stateLocationType === "urlAndSessionStorage"
          ? toUrlFilterQuery(canonicalFiltersQuery)
          : canonicalFiltersQuery;
      if (urlFiltersQuery !== canonicalUrlQuery) {
        setPendingFiltersQuery(canonicalFiltersQuery);
        // replaceIn: sanitizing is a programmatic correction of the current
        // URL — pushing would mint a history entry holding the non-canonical
        // filter, which Back lands on and this effect re-fires (LFE-10715).
        // Same for evicting an oversized query (canonicalUrlQuery = ""):
        // pushing would turn Back into a rewrite loop on a legacy giant link.
        setUrlFiltersQuery(canonicalUrlQuery || null, "replaceIn");
      }

      if (
        stateLocationType === "urlAndSessionStorage" &&
        storedFiltersQuery !== canonicalFiltersQuery
      ) {
        setStoredFiltersQuery(canonicalFiltersQuery);
      }
      return;
    }

    if (
      stateLocationType === "urlAndSessionStorage" &&
      storedFiltersQuery !== canonicalFiltersQuery
    ) {
      setStoredFiltersQuery(canonicalFiltersQuery);
    }
  }, [
    stateLocationType,
    pendingFiltersQuery,
    urlFiltersQuery,
    storedFiltersQuery,
    canonicalFiltersQuery,
    setStoredFiltersQuery,
    setUrlFiltersQuery,
  ]);

  // Mirror explicit URL filter state into session fallback storage.
  useEffect(() => {
    if (stateLocationType !== "urlAndSessionStorage") return;
    if (pendingFiltersQuery !== null) return;
    if (typeof urlFiltersQuery !== "string") return;
    if (!urlFiltersQuery) return;
    if (urlFiltersQuery === storedFiltersQuery) return;

    // Keep session fallback aligned to explicit URL links without clearing
    // previously saved state when URL has no `filter` parameter.
    setStoredFiltersQuery(urlFiltersQuery);
  }, [
    stateLocationType,
    pendingFiltersQuery,
    urlFiltersQuery,
    storedFiltersQuery,
    setStoredFiltersQuery,
  ]);

  // When true, the applied-filter capture inside `updateFilter` is suppressed —
  // set by `updateOperator`, which funnels through `updateFilter` but must emit
  // `filters:facet_operator_toggled` instead of a duplicate `filters:applied`.
  const suppressAppliedCaptureRef = useRef(false);

  // Emit `filters:applied` for a single facet interaction. METADATA ONLY: we
  // derive shape (type/operator/key/counts) from the RESULTING filters for the
  // column and never send the raw filter value (PII). Skips emission when the
  // column ends up with no filter (a deselect-to-empty is a clear, not an
  // apply). Count semantics are aligned with the popover builder (LFE-10781
  // review): `conditionCount` = TOTAL applied conditions across ALL columns
  // (whole-filter complexity); `columnConditionCount` = rows this column
  // produced (a numeric range is 2: >= and <=); `valueCount` = selected options
  // in the attributed condition.
  //
  // `prev` (the pre-change state) lets us attribute the event to the row the
  // user JUST added/changed rather than the oldest one on the column — critical
  // for keyed facets (metadata / scores) that hold several rows per column
  // (adding `metadata.env` on top of `metadata.user_id` must report `env`, not
  // `user_id`). We pick the entry absent from `prev` (added or value-changed);
  // failing that, the last (appended) entry. The identity used to match rows
  // includes the raw value but is only ever compared locally — it is NEVER put
  // on the event payload.
  const emitFilterApplied = useCallback(
    (
      surface: "sidebar" | "filter_builder",
      column: string,
      next: FilterState,
      prev?: FilterState,
    ) => {
      const colFilters = next.filter((f) => f.column === column);
      if (colFilters.length === 0) return;
      const identity = (f: FilterState[number]): string =>
        `${"key" in f ? f.key : ""}\u0000${f.operator}\u0000${JSON.stringify(
          "value" in f ? f.value : null,
        )}`;
      const prevIdentities = new Set(
        (prev ?? []).filter((f) => f.column === column).map((f) => identity(f)),
      );
      const changed = colFilters.find((f) => !prevIdentities.has(identity(f)));
      const primary = changed ?? colFilters[colFilters.length - 1];
      capture("filters:applied", {
        surface,
        tableName: config.tableName,
        column,
        filterType: primary.type,
        operator: primary.operator,
        ...("key" in primary && primary.key ? { key: primary.key } : {}),
        valueCount: Array.isArray(primary.value) ? primary.value.length : 1,
        conditionCount: next.length,
        columnConditionCount: colFilters.length,
        isV4: isV4Surface,
      });
    },
    [capture, config.tableName, isV4Surface],
  );

  const clearAll = () => {
    const clearedCount = explicitFilterState.length;
    setFilterState([]);
    if (clearedCount > 0) {
      capture("filters:cleared", {
        surface: "sidebar",
        tableName: config.tableName,
        scope: "all",
        clearedCount,
        isV4: isV4Surface,
      });
    }
  };

  // One facet's clear affordance (the header ✕ / reset paths). Metadata
  // only: the column id and how many filter rows were removed.
  const emitFacetCleared = useCallback(
    (column: string, clearedCount: number) => {
      capture("filters:cleared", {
        surface: "sidebar",
        tableName: config.tableName,
        scope: "facet",
        column,
        clearedCount,
        isV4: isV4Surface,
      });
    },
    [capture, config.tableName, isV4Surface],
  );

  const updateFilter: UpdateFilter = useCallback(
    (column, values, operator?: "any of" | "none of" | "all of") => {
      const next = applyCheckboxSelection(
        actionContext,
        filterState,
        column,
        values,
        operator,
      );
      setFilterState(next);
      if (!suppressAppliedCaptureRef.current) {
        emitFilterApplied("sidebar", column, next);
      }
    },
    [actionContext, filterState, setFilterState, emitFilterApplied],
  );

  const updateFilterOnly = useCallback(
    (column: string, value: string) => {
      const selection = buildOnlySelection(
        actionContext,
        filterState,
        column,
        value,
      );
      if (!selection) return;
      updateFilter(column, selection.values, selection.operator);
    },
    [actionContext, filterState, updateFilter],
  );

  const emitOperatorToggled = useCallback(
    (
      column: string,
      fromOperator: string | undefined,
      toOperator: "any of" | "all of" | "none of",
      valueCount: number,
    ) => {
      capture("filters:facet_operator_toggled", {
        surface: "sidebar",
        tableName: config.tableName,
        column,
        fromOperator,
        toOperator,
        valueCount,
        isV4: isV4Surface,
      });
    },
    [capture, config.tableName, isV4Surface],
  );

  // Runs `updateFilter` without the `filters:applied` capture, so the operator
  // toggle emits exactly one `filters:facet_operator_toggled` (not both events).
  const applyOperatorChange = useCallback(
    (
      column: string,
      values: string[],
      operator: "any of" | "all of" | "none of",
    ) => {
      suppressAppliedCaptureRef.current = true;
      try {
        updateFilter(column, values, operator);
      } finally {
        suppressAppliedCaptureRef.current = false;
      }
    },
    [updateFilter],
  );

  const updateOperator = useCallback(
    (column: string, newOperator: "any of" | "all of" | "none of") => {
      const change = deriveOperatorChange(actionContext, filterState, column);
      if (!change) return;
      applyOperatorChange(column, change.values, newOperator);
      emitOperatorToggled(
        column,
        change.fromOperator,
        newOperator,
        change.values.length,
      );
    },
    [actionContext, filterState, applyOperatorChange, emitOperatorToggled],
  );

  const updateNumericFilter = useCallback(
    (
      column: string,
      value: [number, number] | null,
      _defaultMin: number,
      _defaultMax: number,
    ) => {
      const next = applyNumericRange(filterState, column, value);
      setFilterState(next);
      // null clears the column — a reset, not an apply.
      if (value !== null) {
        emitFilterApplied("sidebar", column, next);
      } else if (next.length < filterState.length) {
        emitFacetCleared(column, filterState.length - next.length);
      }
    },
    [filterState, setFilterState, emitFilterApplied, emitFacetCleared],
  );

  const updateStringFilter = useCallback(
    (column: string, value: string) => {
      const next = applyStringContains(filterState, column, value);
      setFilterState(next);
      // Blank input clears the column — a reset, not an apply.
      if (value.trim() !== "") {
        emitFilterApplied("sidebar", column, next);
      } else if (next.length < filterState.length) {
        emitFacetCleared(column, filterState.length - next.length);
      }
    },
    [filterState, setFilterState, emitFilterApplied, emitFacetCleared],
  );

  // Text filter management for categorical filters
  // Mutually exclusive with checkbox selections
  const addTextFilter = useCallback(
    (
      column: string,
      operator: "contains" | "does not contain",
      value: string,
    ) => {
      const next = addTextFilterEntry(filterState, column, operator, value);
      if (next === null) return; // blank input
      setFilterState(next);
      emitFilterApplied("sidebar", column, next);
    },
    [filterState, setFilterState, emitFilterApplied],
  );

  const removeTextFilter = useCallback(
    (
      column: string,
      operator: "contains" | "does not contain",
      value: string,
    ) => {
      const next = removeTextFilterEntry(filterState, column, operator, value);
      setFilterState(next);
      // Removing the LAST row on the column is a facet clear; removing one
      // of several is an edit and stays silent.
      if (
        next.length < filterState.length &&
        !next.some((f) => f.column === column)
      ) {
        emitFacetCleared(column, 1);
      }
    },
    [filterState, setFilterState, emitFacetCleared],
  );

  // Keyed facets (metadata, categorical/numeric/boolean/string scores) share
  // one apply/reset pair; the per-kind row semantics live in
  // applyKeyedFilterEntries. Unifying them here also closes an analytics gap:
  // boolean-score applies previously called the raw setter and emitted
  // nothing (Rule 5 of the instrumentation skill).
  const updateKeyedFilter = useCallback(
    (column: string, update: Parameters<typeof applyKeyedFilterEntries>[2]) => {
      const next = applyKeyedFilterEntries(filterState, column, update);
      setFilterState(next);
      // Analytics (LFE-10781): `prev` attributes the event to the row the
      // user just added or changed, not the column's oldest row.
      emitFilterApplied("sidebar", column, next, filterState);
    },
    [filterState, setFilterState, emitFilterApplied],
  );

  const resetKeyedFilter = useCallback(
    (column: string, kind: KeyedFilterKind) => {
      const next = removeColumnFiltersOfType(filterState, column, kind);
      setFilterState(next);
      if (next.length < filterState.length) {
        emitFacetCleared(column, filterState.length - next.length);
      }
    },
    [filterState, setFilterState, emitFacetCleared],
  );

  const filters: UIFilter[] = useMemo((): UIFilter[] => {
    const filterByColumn = new Map(filterState.map((f) => [f.column, f]));
    const expandedSet = new Set(expandedState);

    // Helper to determine if a filter should show loading state
    // Only filters that depend on options from the query should show loading
    const shouldShowLoading = (facetColumn: string): boolean => {
      // Lazy filter-options: a precise per-facet set is supplied, so a facet
      // shows a skeleton iff its own column is still in flight. This avoids the
      // coarse-flag false positive where a never-enumerated facet (metadata,
      // whose options are always undefined) would skeleton on every refetch.
      if (loadingColumns) return loadingColumns.has(facetColumn);
      if (!loading) return false;
      // Only show loading if the filter depends on options and options are not yet available
      // Filters that use options: categorical, keyValue, numericKeyValue, stringKeyValue
      // Filters that don't use options: numeric (uses facet.min/max), string (static), boolean (static)
      return options[facetColumn] === undefined;
    };

    const getFacetDisabledState = (
      facet: FilterConfig["facets"][number],
    ): { isDisabled: boolean; reason?: string } => {
      const staticDisabled = facet.isDisabled ?? false;

      if (staticDisabled) {
        return {
          isDisabled: true,
          reason: facet.disabledReason ?? "This filter is currently disabled.",
        };
      }

      return { isDisabled: false };
    };

    return config.facets
      .map((facet): UIFilter | null => {
        if (facet.type === "numeric") {
          const currentRange = computeNumericRange(
            facet.column,
            filterState,
            facet.min,
            facet.max,
          );
          // Check if there are any numeric filters for this column
          const isActive = filterState.some(
            (f) => f.column === facet.column && f.type === "number",
          );
          const disableState = getFacetDisabledState(facet);
          return {
            type: "numeric",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,
            help: facet.help,

            value: currentRange,
            min: facet.min,
            max: facet.max,
            unit: facet.unit,
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
            onChange: (value: [number, number]) =>
              updateNumericFilter(facet.column, value, facet.min, facet.max),
            onReset: () =>
              updateNumericFilter(facet.column, null, facet.min, facet.max),
          };
        }

        // Handle string filters
        if (facet.type === "string") {
          const filterEntry = filterByColumn.get(facet.column);
          const currentValue =
            filterEntry?.type === "string" &&
            typeof filterEntry.value === "string"
              ? filterEntry.value
              : "";
          const isActive = currentValue.trim() !== "";

          const disableState = getFacetDisabledState(facet);
          return {
            type: "string",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,
            help: facet.help,

            value: currentValue,
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
            onChange: (value: string) =>
              updateStringFilter(facet.column, value),
            onReset: () => updateStringFilter(facet.column, ""),
          };
        }

        // Handle keyValue filters
        if (facet.type === "keyValue") {
          // Extract all categoryOptions filters for this column from filterState
          const categoryFilters = filterState.filter(
            (f) => f.column === facet.column && f.type === "categoryOptions",
          ) as Array<{
            column: string;
            type: "categoryOptions";
            operator: "any of" | "none of";
            key: string;
            value: string[];
          }>;

          // Convert to KeyValueFilterEntry array
          const activeFilters: KeyValueFilterEntry[] = categoryFilters.map(
            (f) => ({
              key: f.key,
              operator: f.operator,
              value: f.value,
            }),
          );

          const isActive = activeFilters.length > 0;
          const disableState = getFacetDisabledState(facet);

          // Get available values from options
          const availableValues = options[facet.column] ?? {};
          const mergedAvailableValues =
            typeof availableValues === "object" &&
            !Array.isArray(availableValues)
              ? mergeAvailableValuesWithActiveFilters(
                  availableValues as Record<string, string[]>,
                  activeFilters,
                )
              : ({} as Record<string, string[]>);

          // Extract key options from availableValues if not defined in facet
          const keyOptions =
            facet.keyOptions ??
            mergeUniqueStrings(
              Object.keys(mergedAvailableValues),
              activeFilters.map((filter) => filter.key),
            );

          return {
            type: "keyValue",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,
            help: facet.help,

            value: activeFilters,
            keyOptions,
            availableValues: mergedAvailableValues,
            loading: shouldShowLoading(facet.column),
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
            onChange: (filters: KeyValueFilterEntry[]) =>
              updateKeyedFilter(facet.column, {
                kind: "categoryOptions",
                entries: filters,
              }),
            onReset: () => resetKeyedFilter(facet.column, "categoryOptions"),
          };
        }

        // Handle numericKeyValue filters
        if (facet.type === "numericKeyValue") {
          // Extract all numberObject filters for this column from filterState
          const numericFilters = filterState.filter(
            (f) => f.column === facet.column && f.type === "numberObject",
          ) as Array<{
            column: string;
            type: "numberObject";
            operator: "=" | ">" | "<" | ">=" | "<=";
            key: string;
            value: number;
          }>;

          // Convert to NumericKeyValueFilterEntry array
          const activeFilters: NumericKeyValueFilterEntry[] =
            numericFilters.map((f) => ({
              key: f.key,
              operator: f.operator,
              value: f.value,
            }));

          const isActive = activeFilters.length > 0;
          const disableState = getFacetDisabledState(facet);

          // Get available keys from options (should be array of score names).
          // Backend numeric score-name discovery keeps BOOLEAN names for
          // legacy numeric filtering; the paired boolean facet (same column
          // with the score_booleans suffix) owns those names in the UI, so
          // subtract them from the offering here. Active filter keys are
          // merged back in resolveKnownKeyOptions, so pre-existing numeric
          // filters on boolean scores (old URLs/saved views) still render
          // and stay editable.
          const pairedBooleanKeys =
            options[facet.column.replace(/scores_avg$/, "score_booleans")];
          const booleanNames = new Set(
            Array.isArray(pairedBooleanKeys)
              ? pairedBooleanKeys.map((option) =>
                  typeof option === "string" ? option : option.value,
                )
              : [],
          );
          const availableKeys = options[facet.column];
          const nonBooleanKeys =
            Array.isArray(availableKeys) && booleanNames.size > 0
              ? availableKeys.filter(
                  (option) =>
                    !booleanNames.has(
                      typeof option === "string" ? option : option.value,
                    ),
                )
              : availableKeys;
          const keyOptions = resolveKnownKeyOptions(
            facet.keyOptions,
            nonBooleanKeys,
            activeFilters.map((filter) => filter.key),
          );

          return {
            type: "numericKeyValue",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,
            help: facet.help,

            value: activeFilters,
            keyOptions,
            loading: shouldShowLoading(facet.column),
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
            onChange: (filters: NumericKeyValueFilterEntry[]) =>
              updateKeyedFilter(facet.column, {
                kind: "numberObject",
                entries: filters,
              }),
            onReset: () => resetKeyedFilter(facet.column, "numberObject"),
          };
        }

        // Handle booleanKeyValue filters
        if (facet.type === "booleanKeyValue") {
          const booleanFilters = filterState.filter(
            (f) => f.column === facet.column && f.type === "booleanObject",
          ) as Array<{
            column: string;
            type: "booleanObject";
            operator: "=" | "<>";
            key: string;
            value: boolean;
          }>;

          const activeFilters: BooleanKeyValueFilterEntry[] =
            booleanFilters.map((f) => ({
              key: f.key,
              operator: f.operator,
              value: f.value,
            }));

          const isActive = activeFilters.length > 0;
          const disableState = getFacetDisabledState(facet);
          const availableKeys = options[facet.column];
          const keyOptions = resolveKnownKeyOptions(
            facet.keyOptions,
            availableKeys,
            activeFilters.map((filter) => filter.key),
          );

          return {
            type: "booleanKeyValue",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,
            help: facet.help,

            value: activeFilters,
            keyOptions,
            loading: shouldShowLoading(facet.column),
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
            onChange: (filters: BooleanKeyValueFilterEntry[]) =>
              updateKeyedFilter(facet.column, {
                kind: "booleanObject",
                entries: filters,
              }),
            onReset: () => resetKeyedFilter(facet.column, "booleanObject"),
          };
        }

        // Handle stringKeyValue filters
        if (facet.type === "stringKeyValue") {
          // Extract all stringObject filters for this column from filterState
          const stringFilters = filterState.filter(
            (f) => f.column === facet.column && f.type === "stringObject",
          ) as Array<{
            column: string;
            type: "stringObject";
            operator: "=" | "contains" | "does not contain";
            key: string;
            value: string;
          }>;

          // Convert to StringKeyValueFilterEntry array
          const activeFilters: StringKeyValueFilterEntry[] = stringFilters.map(
            (f) => ({
              key: f.key,
              operator: f.operator,
              value: f.value,
            }),
          );

          const isActive = activeFilters.length > 0;
          const disableState = getFacetDisabledState(facet);

          // Get available keys from options
          const availableKeys = options[facet.column];
          const keyOptions = resolveKnownKeyOptions(
            facet.keyOptions,
            availableKeys,
            activeFilters.map((filter) => filter.key),
          );

          return {
            type: "stringKeyValue",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,
            help: facet.help,

            value: activeFilters,
            keyOptions,
            loading: shouldShowLoading(facet.column),
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
            onChange: (filters: StringKeyValueFilterEntry[]) =>
              updateKeyedFilter(facet.column, {
                kind: "stringObject",
                entries: filters,
              }),
            onReset: () => resetKeyedFilter(facet.column, "stringObject"),
          };
        }

        // Handle boolean as categorical UI
        if (facet.type === "boolean") {
          const trueLabel = facet.trueLabel ?? "True";
          const falseLabel = facet.falseLabel ?? "False";
          const invert = facet.invertValue ?? false;
          const availableOptions = [trueLabel, falseLabel];
          const filterEntry = filterByColumn.get(facet.column);

          let selectedOptions = availableOptions;
          if (filterEntry) {
            const boolValue = filterEntry.value as boolean;
            if (invert) {
              // Inverted: filter value=true means falseLabel selected, value=false means trueLabel selected
              selectedOptions = boolValue === true ? [falseLabel] : [trueLabel];
            } else {
              selectedOptions = boolValue === true ? [trueLabel] : [falseLabel];
            }
          }
          const isActive = selectedOptions.length === 1;
          const disableState = getFacetDisabledState(facet);

          // Build counts from options
          const rawOptions = options[facet.column];
          let counts: Map<string, number> = EMPTY_MAP;
          if (Array.isArray(rawOptions) && rawOptions.length > 0) {
            const { counts: processedCounts } = processOptions(rawOptions);
            if (processedCounts.size > 0) {
              counts = new Map<string, number>();
              if (invert) {
                // Inverted: trueLabel count comes from "false", falseLabel count comes from "true"
                const falseCount = processedCounts.get("false") ?? 0;
                const trueCount = processedCounts.get("true") ?? 0;
                if (falseCount > 0) counts.set(trueLabel, falseCount);
                if (trueCount > 0) counts.set(falseLabel, trueCount);
              } else {
                const trueCount = processedCounts.get("true") ?? 0;
                const falseCount = processedCounts.get("false") ?? 0;
                if (trueCount > 0) counts.set(trueLabel, trueCount);
                if (falseCount > 0) counts.set(falseLabel, falseCount);
              }
            }
          }

          return {
            type: "categorical",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,
            help: facet.help,

            value: selectedOptions,
            options: availableOptions,
            counts,
            loading: shouldShowLoading(facet.column),
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
            onChange: (values: string[]) => {
              if (values.length === 0 || values.length === 2) {
                updateFilter(facet.column, []);
                return;
              }
              if (values.includes(trueLabel) && !values.includes(falseLabel)) {
                updateFilter(facet.column, [trueLabel]);
              } else if (
                values.includes(falseLabel) &&
                !values.includes(trueLabel)
              ) {
                updateFilter(facet.column, [falseLabel]);
              }
            },
            onOnlyChange: (value: string) => {
              if (
                selectedOptions.length === 1 &&
                selectedOptions.includes(value)
              ) {
                updateFilter(facet.column, []);
              } else {
                updateFilter(facet.column, [value]);
              }
            },
            onReset: () => updateFilter(facet.column, []),
          };
        }

        // Handle categorical
        const availableValuesRaw = options[facet.column] ?? [];
        // For nested structures, default to empty array (shouldn't happen for categorical)
        const availableValuesWithOptions = Array.isArray(availableValuesRaw)
          ? availableValuesRaw
          : [];

        // Extract counts and values to display along multi-select values
        const {
          values: availableValues,
          counts,
          displayByValue,
        } = Array.isArray(availableValuesWithOptions)
          ? processOptions(availableValuesWithOptions)
          : { values: [], counts: EMPTY_MAP, displayByValue: undefined };

        // Check if this column supports operator toggle
        // Only arrayOptions columns get the ANY/ALL toggle
        // - arrayOptions: multi-valued arrays (e.g., tags on a trace)
        // - stringOptions: single-valued strings (e.g., environment)
        const colDef = config.columnDefinitions.find(
          (c) => c.id === facet.column,
        );
        const isArrayOptions = colDef?.type === "arrayOptions";
        const textFilterDisabled =
          facet.type === "categorical" && facet.disableTextFilter === true;

        // Get the checkbox filter (stringOptions/arrayOptions) for this column
        const checkboxFilter = filterState.find(
          (f) =>
            f.column === facet.column &&
            (f.type === "stringOptions" || f.type === "arrayOptions"),
        );

        const selectedValues = computeSelectedValues(
          availableValues,
          checkboxFilter,
        );

        // Determine current operator for ANY/ALL toggle
        // When a user selects items in an arrayOptions filter, we expose a toggle
        // to switch between:
        // - "any of" (OR logic): match if item has ANY selected value
        // - "all of" (AND logic): match if item has ALL selected values
        // This operator is persisted in the filter state and URL
        let currentOperator: "any of" | "all of" | "none of" | undefined;
        if (
          checkboxFilter &&
          (checkboxFilter.type === "arrayOptions" ||
            checkboxFilter.type === "stringOptions") &&
          (checkboxFilter.operator === "any of" ||
            checkboxFilter.operator === "all of" ||
            checkboxFilter.operator === "none of")
        ) {
          currentOperator = checkboxFilter.operator;
        } else if (isArrayOptions && selectedValues.length > 0) {
          // Default to "any of" for arrayOptions when selections exist but no explicit operator
          currentOperator = "any of";
        } else {
          currentOperator = undefined;
        }

        // Extract text filters for this column (contains/does not contain)
        const textFilters: TextFilterEntry[] = filterState
          .filter(
            (f): f is Extract<typeof f, { type: "string" }> =>
              f.column === facet.column &&
              f.type === "string" &&
              (f.operator === "contains" || f.operator === "does not contain"),
          )
          .map((f) => ({
            operator: f.operator as "contains" | "does not contain",
            value: f.value,
          }));

        const hasTextFilters = textFilters.length > 0;
        const hasExplicitCheckboxFilter =
          !!checkboxFilter &&
          Array.isArray(checkboxFilter.value) &&
          checkboxFilter.value.length > 0;
        const hasExplicitCheckboxFilterWhileLoading =
          hasExplicitCheckboxFilter &&
          selectedValues.length === 0 &&
          availableValues.length === 0;
        const hasCheckboxSelections =
          selectedValues.length > 0 &&
          selectedValues.length !== availableValues.length;
        const isManagedEnvironmentFacet =
          facet.column === managedEnvironmentColumn &&
          managedEnvironmentPolicyConfig.hiddenEnvironments.length > 0;
        // A user-authored environment filter lives in EXPLICIT state; the
        // implicit hidden-env default (`none of [hidden]`) is added to EFFECTIVE
        // state only and stripped from explicit state by the managed-environment
        // policy. So "explicit env filter present" is exactly "the user committed
        // to an environment selection" — including `environment:default` (any-of
        // the default set), which now persists. Keying the facet's active state
        // off this keeps it in sync with the search bar, which renders any
        // explicit env filter as a chip.
        const hasExplicitManagedEnvironmentFilter =
          isManagedEnvironmentFacet &&
          explicitFilterState.some(
            (filter) => filter.column === managedEnvironmentColumn,
          );

        // isActive check:
        // - Managed environment facet: active whenever the user authored an
        //   explicit env filter (the implicit hidden-env default lives only in
        //   effective state, so it never surfaces a "Clear" badge).
        // - Other facets: active when text filters exist or checkbox selections differ from unfiltered.
        //   Special case: "all of" with all values selected is still active.
        //   Special case: a "none of" filter renders as its complement, so
        //   when every exclusion sits outside the current option list the
        //   checkboxes all show checked — the live filter must still surface
        //   its "Clear" affordance.
        const isActive =
          hasTextFilters ||
          (isManagedEnvironmentFacet
            ? hasExplicitManagedEnvironmentFilter
            : (currentOperator === "all of" &&
                (selectedValues.length === availableValues.length ||
                  hasExplicitCheckboxFilterWhileLoading)) ||
              (currentOperator === "none of" && hasExplicitCheckboxFilter) ||
              hasCheckboxSelections ||
              hasExplicitCheckboxFilterWhileLoading);
        const disableState = getFacetDisabledState(facet);

        return {
          type: "categorical",
          column: facet.column,
          label: facet.label,
          tooltip: facet.tooltip,
          help: facet.help,

          value: selectedValues,
          options: availableValues,
          counts,
          displayByValue,
          loading: shouldShowLoading(facet.column),
          expanded: expandedSet.has(facet.column),
          isActive,
          isDisabled: disableState.isDisabled,
          disabledReason: disableState.reason,
          renderIcon:
            facet.type === "categorical" ? facet.renderIcon : undefined,
          onChange: (values: string[]) => updateFilter(facet.column, values),
          onOnlyChange: (value: string) => {
            if (selectedValues.length === 1 && selectedValues.includes(value)) {
              // The label reads "All" in this state: re-select every option.
              // Passing the full option list (not []) matters for an active
              // "none of" filter — empty values there would re-derive to
              // "exclude everything", the opposite of the label's promise.
              updateFilter(facet.column, availableValues);
            } else {
              updateFilterOnly(facet.column, value);
            }
          },
          onReset: () => {
            // Reset both checkboxes AND text filters
            const next = clearCategoricalColumn(filterState, facet.column);
            setFilterState(next);
            if (next.length < filterState.length) {
              emitFacetCleared(facet.column, filterState.length - next.length);
            }
          },
          // The operator is exposed for every checkbox facet so the "none of"
          // display logic (pinning excluded rows) works on stringOptions too;
          // the SOME/ALL/NONE toggle itself is gated on onOperatorChange below.
          operator: currentOperator,
          excludedValues:
            checkboxFilter?.operator === "none of" &&
            Array.isArray(checkboxFilter.value)
              ? (checkboxFilter.value as string[])
              : undefined,
          onOperatorChange: isArrayOptions
            ? (op: "any of" | "all of" | "none of") =>
                updateOperator(facet.column, op)
            : undefined,
          // Text filter support - ONLY for stringOptions, NOT arrayOptions or boolean
          textFilters:
            !isArrayOptions && !textFilterDisabled ? textFilters : undefined,
          onTextFilterAdd:
            !isArrayOptions && !textFilterDisabled
              ? (op, val) => addTextFilter(facet.column, op, val)
              : undefined,
          onTextFilterRemove:
            !isArrayOptions && !textFilterDisabled
              ? (op, val) => removeTextFilter(facet.column, op, val)
              : undefined,
        };
      })
      .filter((f): f is UIFilter => f !== null);
  }, [
    config,
    options,
    loading,
    loadingColumns,
    filterState,
    explicitFilterState,
    updateFilter,
    updateFilterOnly,
    updateOperator,
    updateNumericFilter,
    updateStringFilter,
    addTextFilter,
    removeTextFilter,
    updateKeyedFilter,
    resetKeyedFilter,
    emitFacetCleared,
    expandedState,
    setFilterState,
    managedEnvironmentColumn,
    managedEnvironmentPolicyConfig.hiddenEnvironments,
  ]);

  return {
    filterState,
    effectiveFilterState: filterState,
    explicitFilterState,
    setFilterState,
    updateFilter,
    updateFilterOnly,
    updateOperator,
    clearAll,
    isFiltered: explicitFilterState.length > 0,
    filters,
    expanded: expandedState,
    onExpandedChange,
    // Exposed so view-layer captures (DataTableControls) carry the same
    // v3-vs-v4 dimension as the hook's own events.
    isV4: isV4Surface,
  };
}
