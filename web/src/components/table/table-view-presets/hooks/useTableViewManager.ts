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
import { StringParam, type UrlUpdateType } from "use-query-params";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useQueryParam } from "use-query-params";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import isEqual from "lodash/isEqual";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { validateOrderBy, validateFilters } from "../validation";
import { isSystemPresetId } from "../components/data-table-view-presets-drawer";
import type { FilterStateMigration } from "@/src/features/filters/lib/filter-config";

/** How a saved view / preset apply was initiated — the `trigger` analytics
 * dimension on `saved_views:applied` (LFE-10781). `system_preset_cleared` is a
 * v4 category-chip toggle-off (applies the cleared/default state). */
export type SavedViewApplyTrigger =
  | "select"
  | "permalink"
  | "default"
  | "system_preset"
  | "system_preset_cleared";

export type SavedViewApplyMeta = {
  trigger: SavedViewApplyTrigger;
  viewId?: string | null;
};

export type ApplyViewStateFn = (
  viewData: TableViewPresetState,
  meta?: SavedViewApplyMeta,
) => void;

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

  // Keep track of the viewId in session storage and in the query params.
  // `updateType` controls the browser-history semantics of the URL write:
  // user-initiated selections keep the default (push — a Back-able step),
  // while programmatic corrections pass `replaceIn` so the pre-write URL does
  // not survive as a history entry that Back lands on and that re-triggers
  // the write (LFE-10715).
  const handleSetViewId = useCallback(
    (viewId: string | null, options?: { updateType?: UrlUpdateType }) => {
      setStoredViewId(viewId);
      setSelectedViewId(viewId, options?.updateType);

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
      handleSetViewId(null, { updateType: "replaceIn" });
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
        handleSetViewId(null, { updateType: "replaceIn" });
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

  // v4 fast-mode surface iff this manager drives the events table. Drives the
  // `isV4` dimension on `saved_views:applied` (LFE-10781).
  const isV4 = tableName === TableViewPresetTableName.ObservationsEvents;

  // Method to apply state from a view
  const applyViewState = useCallback(
    (viewData: TableViewPresetState, meta?: SavedViewApplyMeta) => {
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
      //
      // EMPTY payloads carry no column opinion and must not touch the user's
      // layout: system presets (and the chips' cleared state) ship
      // `columnOrder: []` / `columnVisibility: {}`, and writing those through
      // would reconcile the table back to default columns and PERSIST that to
      // localStorage — silently wiping per-user reordering/visibility on every
      // preset apply. User-saved views always persist a full non-empty
      // snapshot, so gating on non-empty only skips the no-opinion payloads.
      if (viewData.columnOrder && viewData.columnOrder.length > 0) {
        const migratedColumnOrder = validationContext.migrateColumnOrder
          ? validationContext.migrateColumnOrder(viewData.columnOrder)
          : viewData.columnOrder;
        setColumnOrder(migratedColumnOrder);
      }
      if (
        viewData.columnVisibility &&
        Object.keys(viewData.columnVisibility).length > 0
      )
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

      // Analytics (LFE-10781): a saved view / preset was applied. METADATA ONLY
      // — we send the view id + filter COUNT, never the filter values. Fires for
      // every apply path, including the programmatic default/session restore the
      // drawer's own captures miss. `trigger` classifies the entry point.
      if (meta) {
        capture("saved_views:applied", {
          tableName,
          viewId: meta.viewId ?? null,
          trigger: meta.trigger,
          filterCount: validFilters.length,
          isV4,
        });
      }
    },
    [
      capture,
      tableName,
      isV4,
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
      // A 404 is an expected outcome, not an incident: system presets are
      // code-defined and a catalog iteration can retire an id that still
      // lives in bookmarks/session storage. Silence the GLOBAL query-cache
      // error toast for it — the error effect below owns the messaging
      // (friendly retirement notice vs. real error).
      meta: { silentHttpCodes: [404] },
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
      handleSetViewId(null, { updateType: "replaceIn" });
      return;
    }

    // Wait for the default-view query to resolve before applying, so the
    // trigger is classified correctly. `getDefault` and `getById` race with no
    // ordering; if `getById` wins (cold cache, a bookmark of the default view,
    // session-restore), `defaultViewId` is still undefined here and a
    // default-view restore would be mislabeled `permalink` — permanently, since
    // the `isInitializedRef` guard makes this a one-shot (LFE-10781 review).
    if (isDefaultLoading) return;

    // Track permalink visit
    capture("saved_views:permalink_visit", {
      tableName,
      viewId: requestedViewId,
      name: selectedViewData.name,
    });

    // This single programmatic-restore effect covers URL permalinks, session
    // restore, and the resolved default view. Classify as "default" when the
    // applied view is the resolved default, else treat as a "permalink"
    // (deep-link / session-restore) entry (LFE-10781).
    applyViewState(selectedViewData, {
      trigger: requestedViewId === defaultViewId ? "default" : "permalink",
      viewId: requestedViewId,
    });
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
    defaultViewId,
    isDefaultLoading,
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
    handleSetViewId(null, { updateType: "replaceIn" });
    // A 404 on a system-preset id means the catalog retired it (system
    // presets are code-defined); stale references live on in bookmarks and
    // session storage. Stale DEFAULTS never reach here (getDefault
    // self-heals them server-side), so this is an explicit-ish reference —
    // tell the user once why they landed on the default table (a dead
    // bookmark is fixable), in a friendlier voice than the real error kept
    // for dangling user views and for transient failures (which must stay
    // loud — a network blip is not a retirement).
    if (
      isSystemPresetId(requestedViewId) &&
      selectedViewError.data?.httpStatus === 404
    ) {
      // How many users still follow "the older way" (a retired preset
      // reference) and get redirected — sizes the cost of each catalog
      // iteration.
      capture("saved_views:retired_view_redirect", {
        tableName,
        viewId: requestedViewId,
      });
      showErrorToast(
        "View no longer available",
        "This suggested view was retired — showing the default view instead.",
        "WARNING",
      );
    } else {
      showErrorToast(
        "Error applying view",
        selectedViewError.message,
        "WARNING",
      );
    }
  }, [
    disabled,
    isSelectedViewError,
    selectedViewError,
    selectedViewId,
    handleSetViewId,
    capture,
    tableName,
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
