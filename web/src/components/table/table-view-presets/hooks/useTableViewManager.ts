import { api } from "@/src/utils/api";
import {
  TableViewPresetTableName,
  type FilterState,
  type OrderByState,
  type TableViewPresetState,
  type ColumnDefinition,
} from "@langfuse/shared";
import { type NextRouter, useRouter } from "next/router";
import { useEffect, useCallback, useState, useRef } from "react";
import { type VisibilityState } from "@tanstack/react-table";
import { StringParam } from "use-query-params";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useQueryParam } from "use-query-params";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import isEqual from "lodash/isEqual";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { validateOrderBy, validateFilters } from "../validation";
import { isSystemPresetId } from "../components/data-table-view-presets-drawer";
import type { FilterStateMigration } from "@/src/features/filters/lib/filter-config";

interface TableStateUpdaters {
  setColumnOrder: (columnOrder: string[]) => void;
  setColumnVisibility: (columnVisibility: VisibilityState) => void;
  setOrderBy?: (orderBy: OrderByState) => void;
  setFilters?: (filters: FilterState) => void;
  setSearchQuery?: (searchQuery: string | null) => void;
  setExpandedFilters?: (expandedFilters: string[]) => void;
}

interface UseTableStateProps {
  tableName: TableViewPresetTableName;
  projectId: string;
  stateUpdaters: TableStateUpdaters;
  validationContext?: {
    columns?: LangfuseColumnDef<any, any>[];
    filterColumnDefinition?: ColumnDefinition[];
    expandableFilterColumns?: string[];
    migrateFilterState?: FilterStateMigration;
    /**
     * Runs on a persisted saved-view `columnOrder` before it is applied, so a
     * table whose default column position changed can reposition a stale column
     * in pre-PR view payloads (mirrors `migrateFilterState`). Must be a pure
     * transform; return the input unchanged to leave the order untouched.
     */
    migrateColumnOrder?: (columnOrder: string[]) => string[];
  };
  currentFilterState?: FilterState;
  currentExpandedFilters?: string[];
  disabled?: boolean;
  allowBackendSystemPresets?: boolean;
}

const isViewApplicableToTable = (
  currentTableName: TableViewPresetTableName,
  viewTableName: TableViewPresetTableName,
) =>
  currentTableName === viewTableName ||
  (currentTableName === TableViewPresetTableName.ObservationsEvents &&
    viewTableName === TableViewPresetTableName.Observations);

const IMPLICIT_VIEW_BLOCKING_QUERY_PARAMS = [
  "filter",
  "search",
  "searchType",
  "orderBy",
] as const;

const hasQueryParam = (
  query: NextRouter["query"],
  key: (typeof IMPLICIT_VIEW_BLOCKING_QUERY_PARAMS)[number],
) => {
  const value = query[key];
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== "";
};

const hasExplicitTableStateInUrl = (query: NextRouter["query"]) =>
  IMPLICIT_VIEW_BLOCKING_QUERY_PARAMS.some((key) => hasQueryParam(query, key));

/**
 * Hook to manage table view state with permalink support
 */
export function useTableViewManager({
  projectId,
  tableName,
  stateUpdaters,
  validationContext = {},
  currentFilterState,
  currentExpandedFilters,
  disabled = false,
  allowBackendSystemPresets = false,
}: UseTableStateProps) {
  const router = useRouter();
  const isRouterReady = router.isReady;
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const capture = usePostHogClientCapture();

  const [storedViewId, setStoredViewId] = useSessionStorage<string | null>(
    `${tableName}-${projectId}-viewId`,
    null,
  );
  const [selectedViewIdParam, setSelectedViewId] = useQueryParam(
    "viewId",
    StringParam,
  );
  const selectedViewId = selectedViewIdParam ?? null;
  const selectedViewIdRef = useRef<string | null>(selectedViewId);
  selectedViewIdRef.current = selectedViewId;
  const isInitializedRef = useRef(isInitialized);
  isInitializedRef.current = isInitialized;

  // Query for resolved default view (user > project > null)
  const { data: resolvedDefault, isLoading: isDefaultLoading } =
    api.TableViewPresets.getDefault.useQuery(
      { projectId, viewName: tableName },
      {
        enabled: !!projectId && !disabled,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      },
    );

  // Keep track of the viewId in session storage and in the query params
  const handleSetViewId = useCallback(
    (viewId: string | null) => {
      setStoredViewId(viewId);
      setSelectedViewId(viewId);

      // Explicitly selecting "My view (default)" should stop bootstrap restore.
      // Otherwise an in-flight bootstrap can restore a previously selected view.
      if (viewId === null && !isInitializedRef.current) {
        isInitializedRef.current = true;
        setIsInitialized(true);
        setIsLoading(false);
      }
    },
    [setStoredViewId, setSelectedViewId],
  );

  // Extract updater functions and store in refs to avoid stale closures
  const {
    setOrderBy,
    setFilters,
    setColumnOrder,
    setColumnVisibility,
    setSearchQuery,
    setExpandedFilters,
  } = stateUpdaters;

  // Use refs to always get latest function references to avoid stale closures in applyViewState
  // for restoring view state from the saved views
  const setFiltersRef = useRef(setFilters);
  const setOrderByRef = useRef(setOrderBy);
  const setSearchQueryRef = useRef(setSearchQuery);
  const setExpandedFiltersRef = useRef(setExpandedFilters);

  // Update refs immediately on every render
  setFiltersRef.current = setFilters;
  setOrderByRef.current = setOrderBy;
  setSearchQueryRef.current = setSearchQuery;
  setExpandedFiltersRef.current = setExpandedFilters;

  // Extract primitive for effect dep (rerender-dependencies: avoid object deps)
  const defaultViewId = resolvedDefault?.viewId;

  // Single resolve effect: walk priority list and either return early (pending) or initialize.
  // `selectedViewId` (use-query-params state) is the single source of truth for bootstrap/fetch.
  useEffect(() => {
    if (disabled) return;
    if (isInitialized) return;
    if (!isRouterReady) return;

    // Clear stale frontend-only system presets from the URL first (they are
    // defined in code, not the DB, so there is nothing to fetch).
    if (
      selectedViewId &&
      isSystemPresetId(selectedViewId) &&
      !allowBackendSystemPresets
    ) {
      handleSetViewId(null);
      return;
    }

    const hasResolvableView =
      !!selectedViewId &&
      (!isSystemPresetId(selectedViewId) || allowBackendSystemPresets);

    // Explicit table state in the URL (`filter`/`search`/`searchType`/
    // `orderBy`) is authoritative, even when a `viewId` is present. The viewId
    // is a provenance reference — which saved view a link came from — but the
    // URL's filters/sort/search are what is actually applied (the URL is the
    // source of truth). We do NOT fetch or apply the saved view here: applying
    // it would overwrite the URL's filters, and writing its column layout would
    // silently mutate the visitor's own per-table localStorage on a
    // non-deliberate link open. The viewId stays in the URL so the drawer still
    // shows the originating view. Preserves deep-link precedence (#13865) and
    // makes shared links carry in-view edits (LFE-10486).
    if (hasExplicitTableStateInUrl(router.query)) {
      setIsInitialized(true);
      setIsLoading(false);
      return;
    }

    // A real saved view (or an allowed backend system preset) in the URL with
    // no explicit table state → let the getById query resolve and hydrate it.
    if (hasResolvableView) {
      return;
    }

    // Priority 1: Session storage (from a previous visit to this table)
    if (
      storedViewId &&
      (!isSystemPresetId(storedViewId) || allowBackendSystemPresets)
    ) {
      setSelectedViewId(storedViewId);
      return;
    }

    // Priority 2: Default view (wait for query to resolve)
    if (isDefaultLoading) return;

    if (defaultViewId) {
      if (isSystemPresetId(defaultViewId) && !allowBackendSystemPresets) {
        handleSetViewId(null);
        return;
      }
      setStoredViewId(defaultViewId);
      setSelectedViewId(defaultViewId);
      return;
    }

    // Priority 3: Nothing to apply
    setIsInitialized(true);
    setIsLoading(false);
  }, [
    disabled,
    isInitialized,
    isRouterReady,
    selectedViewId,
    router.query,
    storedViewId,
    isDefaultLoading,
    defaultViewId,
    allowBackendSystemPresets,
    handleSetViewId,
    setStoredViewId,
    setSelectedViewId,
  ]);

  // Method to apply state from a view
  const applyViewState = useCallback(
    (viewData: TableViewPresetState) => {
      // lock table
      setIsLoading(true);

      /**
       * Validate orderBy and filters
       */
      let validOrderBy: OrderByState | null = null;
      let validFilters: FilterState = [];
      if (viewData.orderBy) {
        validOrderBy = validateOrderBy(
          viewData.orderBy,
          validationContext.columns,
          validationContext.filterColumnDefinition,
        );
      }

      // Validate and apply filters
      if (viewData.filters) {
        validFilters = validateFilters(
          viewData.filters,
          validationContext.filterColumnDefinition,
          validationContext.migrateFilterState,
        );
      }

      if (
        !isEqual(validOrderBy, viewData.orderBy) ||
        validFilters.length !== viewData.filters.length
      ) {
        showErrorToast(
          "Outdated view",
          "This view is outdated. Some old filters or ordering may have been ignored. Please update your view.",
          "WARNING",
        );
      }

      if (setOrderByRef.current) setOrderByRef.current(validOrderBy);

      const filtersAlreadyApplied = isEqual(currentFilterState, validFilters);

      if (
        setExpandedFiltersRef.current &&
        validationContext.expandableFilterColumns?.length
      ) {
        const nextExpandedFilters = Array.from(
          new Set([
            ...(currentExpandedFilters ?? []),
            ...validFilters
              .map((filter) => filter.column)
              .filter((column) =>
                validationContext.expandableFilterColumns?.includes(column),
              ),
          ]),
        );

        setExpandedFiltersRef.current(nextExpandedFilters);
      }

      // Apply the view's filters unless what is applied already matches. The
      // sidebar filter hook updates optimistically, so the applied filter state
      // — and the URL it writes to — reflect the view synchronously.
      if (setFiltersRef.current && !filtersAlreadyApplied) {
        setFiltersRef.current(validFilters);
      }

      if (setSearchQueryRef.current) {
        // `||` (not `??`): a persisted empty string — the common case for views
        // saved without a free-text search — must map to null too, or it
        // serializes as a literal empty `?search=` param in the URL.
        setSearchQueryRef.current(viewData.searchQuery || null);
      }

      // Apply column order and visibility without validation since UI will handle gracefully.
      // A saved view persists its own columnOrder snapshot, so a pre-PR view can
      // re-introduce a stale column position even after the localStorage migration
      // has run (the migration is one-shot and this is a separate persistence path).
      // Run the table's opt-in columnOrder migration on the payload first so the
      // same "only reposition a stale default" rule applies here too.
      if (viewData.columnOrder) {
        const migratedColumnOrder = validationContext.migrateColumnOrder
          ? validationContext.migrateColumnOrder(viewData.columnOrder)
          : viewData.columnOrder;
        setColumnOrder(migratedColumnOrder);
      }
      if (viewData.columnVisibility)
        setColumnVisibility(viewData.columnVisibility);

      // Unlock as soon as the view is applied. Earlier versions kept the table
      // locked until a useEffect observer saw the filter change propagate to
      // `currentFilterState`; that observer was the source of LFE-7389
      // fragility — an early return or a canonicalized-shape mismatch could
      // leave the table showing unfiltered rows, or never unlock. The sidebar
      // filter hook applies updates optimistically, so propagation is
      // synchronous and the URL becomes the source of truth for the applied
      // filters on the same render. Unlock deterministically here instead.
      setIsLoading(false);
    },
    [
      setColumnOrder,
      setColumnVisibility,
      validationContext,
      currentFilterState,
      currentExpandedFilters,
    ],
  );

  // Fetch view data if a viewId is provided (skip for frontend-only system presets)
  const {
    data: selectedViewData,
    error: selectedViewError,
    isSuccess: isSelectedViewSuccess,
    isError: isSelectedViewError,
  } = api.TableViewPresets.getById.useQuery(
    { viewId: selectedViewId as string, projectId },
    {
      enabled:
        !disabled &&
        isRouterReady &&
        !!selectedViewId &&
        !isInitialized &&
        // Explicit URL state is authoritative and we deliberately do not apply
        // the view over it (no filter overwrite, no localStorage column
        // mutation on a link open) — so there is nothing to fetch.
        !hasExplicitTableStateInUrl(router.query) &&
        (!isSystemPresetId(selectedViewId) || allowBackendSystemPresets),
    },
  );

  useEffect(() => {
    if (disabled) return;
    if (!isSelectedViewSuccess || !selectedViewData) return;
    const requestedViewId = selectedViewId;
    if (!requestedViewId) return;
    if (isInitializedRef.current) return;
    // Explicit URL state is authoritative and the view is deliberately not
    // applied over it — guard here too (not just via the query `enabled`) so
    // cached view data can never apply the view on the first render regardless
    // of effect timing (LFE-10486).
    if (hasExplicitTableStateInUrl(router.query)) {
      setIsInitialized(true);
      setIsLoading(false);
      return;
    }
    if (selectedViewIdRef.current !== requestedViewId) return;
    if (selectedViewData.id !== requestedViewId) return;
    if (!isViewApplicableToTable(tableName, selectedViewData.tableName)) {
      handleSetViewId(null);
      return;
    }

    // Track permalink visit
    capture("saved_views:permalink_visit", {
      tableName,
      viewId: requestedViewId,
      name: selectedViewData.name,
    });

    applyViewState(selectedViewData);
    if (storedViewId !== requestedViewId) {
      setStoredViewId(requestedViewId);
    }
    isInitializedRef.current = true;
    setIsInitialized(true);
  }, [
    disabled,
    isSelectedViewSuccess,
    selectedViewData,
    selectedViewId,
    router.query,
    handleSetViewId,
    capture,
    tableName,
    applyViewState,
    storedViewId,
    setStoredViewId,
  ]);

  useEffect(() => {
    if (disabled) return;
    if (!isSelectedViewError || !selectedViewError) return;
    const requestedViewId = selectedViewId;
    if (!requestedViewId) return;
    if (isInitializedRef.current) return;
    if (selectedViewIdRef.current !== requestedViewId) return;

    isInitializedRef.current = true;
    setIsInitialized(true);
    setIsLoading(false);
    handleSetViewId(null);
    showErrorToast("Error applying view", selectedViewError.message, "WARNING");
  }, [
    disabled,
    isSelectedViewError,
    selectedViewError,
    selectedViewId,
    handleSetViewId,
  ]);

  if (disabled) {
    return {
      isLoading: false,
      applyViewState: () => {},
      handleSetViewId: () => {},
      selectedViewId: null,
      appliedViewId: null,
      defaultViewScope: null,
    };
  }

  return {
    isLoading,
    applyViewState,
    handleSetViewId,
    selectedViewId,
    // The view whose state is reflected in the live table — i.e. whose column
    // layout is in localStorage. We reuse `storedViewId` (session-persisted,
    // set on apply/create/select and cleared on deselect) rather than a
    // session-scoped React flag, so the signal survives a reload: after a view
    // is applied the URL becomes `?viewId=X&filter=...`, and on reload the
    // explicit-URL-state short-circuit skips re-applying it — but storedViewId
    // is still X, so "Update view" correctly trusts the live columns instead of
    // reverting to the view's stored snapshot. On a fresh shared-link visit
    // storedViewId is null (or another view), so the view's columns are
    // preserved (the visitor's own localStorage layout is not saved over the
    // view).
    //
    // Deliberate tradeoff: storedViewId is sessionStorage (per-tab) while the
    // column layout is localStorage (cross-tab). So the *owner* reopening their
    // own `?viewId=X&filter=...` bookmark in a NEW tab is indistinguishable at
    // runtime from a stranger opening a shared link — both have empty
    // sessionStorage + explicit URL state. We intentionally err toward
    // preserving the saved view's stored columns when ambiguous: the cost is
    // that an in-tab column reorder in that new tab is not saved on "Update
    // view" (recoverable — re-select the view, then update), whereas trusting
    // the live columns would let any visitor silently overwrite a shared view's
    // columns. A robust resolution needs the column-state-model rework
    // (decouple "the view's columns" from "my personal columns"); a per-tab
    // signal cannot tell the two visits apart. Keep this comment if "fixing"
    // the symmetric case is attempted. (LFE-10486)
    appliedViewId: storedViewId,
    defaultViewScope: resolvedDefault?.scope ?? null,
  };
}
