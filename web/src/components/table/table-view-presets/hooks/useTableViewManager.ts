import { api } from "@/src/utils/api";
import {
  type TableViewPresetTableName,
  type FilterState,
  type OrderByState,
  type TableViewPresetDomain,
  type ColumnDefinition,
} from "@langfuse/shared";
import { type DefaultViewScope } from "@langfuse/shared/src/server";
import { useRouter } from "next/router";
import { useEffect, useCallback, useState, useRef } from "react";
import { type VisibilityState } from "@tanstack/react-table";
import { StringParam, withDefault } from "use-query-params";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useQueryParam } from "use-query-params";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import isEqual from "lodash/isEqual";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { validateOrderBy, validateFilters } from "../validation";
import { isSystemPresetId } from "../components/data-table-view-presets-drawer";

interface TableStateUpdaters {
  setColumnOrder: (columnOrder: string[]) => void;
  setColumnVisibility: (columnVisibility: VisibilityState) => void;
  setOrderBy?: (orderBy: OrderByState) => void;
  setFilters?: (filters: FilterState) => void;
  setSearchQuery?: (searchQuery: string) => void;
}

interface UseTableStateProps {
  tableName: TableViewPresetTableName;
  projectId: string;
  stateUpdaters: TableStateUpdaters;
  validationContext?: {
    columns?: LangfuseColumnDef<any, any>[];
    filterColumnDefinition?: ColumnDefinition[];
  };
  currentFilterState?: FilterState;
}

/**
 * Hook to manage table view state with permalink support
 */
export function useTableViewManager({
  projectId,
  tableName,
  stateUpdaters,
  validationContext = {},
  currentFilterState,
}: UseTableStateProps) {
  const router = useRouter();
  const { viewId } = router.query;
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const capture = usePostHogClientCapture();
  const pendingFiltersRef = useRef<FilterState | null>(null);

  const [storedViewId, setStoredViewId] = useSessionStorage<string | null>(
    `${tableName}-${projectId}-viewId`,
    null,
  );
  const [selectedViewId, setSelectedViewId] = useQueryParam(
    "viewId",
    withDefault(StringParam, storedViewId),
  );

  // Query for resolved default view (user > project > null)
  const { data: resolvedDefault, isLoading: isDefaultLoading } =
    api.TableViewPresets.getDefault.useQuery(
      { projectId, viewName: tableName },
      {
        enabled: !!projectId,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      },
    );

  // Keep track of the viewId in session storage and in the query params
  const handleSetViewId = useCallback(
    (viewId: string | null) => {
      // to ensure immediate sync -> update URL
      const url = new URL(window.location.href);
      if (viewId === null) {
        url.searchParams.delete("viewId");
      } else {
        url.searchParams.set("viewId", viewId);
      }
      window.history.replaceState({}, "", url.toString());
      setStoredViewId(viewId);
      setSelectedViewId(viewId);
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
  } = stateUpdaters;

  // Use refs to always get latest function references to avoid stale closures in applyViewState
  // for restoring view state from the saved views
  const setFiltersRef = useRef(setFilters);
  const setOrderByRef = useRef(setOrderBy);
  const setSearchQueryRef = useRef(setSearchQuery);

  // Update refs immediately on every render
  setFiltersRef.current = setFilters;
  setOrderByRef.current = setOrderBy;
  setSearchQueryRef.current = setSearchQuery;

  // Ref to prevent re-dispatching setSelectedViewId while waiting for router.query to catch up.
  const pendingResolveRef = useRef(false);
  // Extract primitive for effect dep (rerender-dependencies: avoid object deps)
  const defaultViewId = resolvedDefault?.viewId;

  // Single resolve effect: walk priority list and either return early (pending) or initialize.
  //
  // IMPORTANT: This effect must NOT call handleSetViewId to set a viewId, because
  // handleSetViewId does replaceState before setSelectedViewId.
  // use-query-params reads window.location.search to detect changes,
  // so the prior replaceState makes it think nothing changed (skipUpdateWhenNoChange)
  // → router.replace is never called → router.query never updates → getById query never fires.
  // Instead, call setSelectedViewId directly so use-query-params sees a genuine URL change.
  useEffect(() => {
    if (isInitialized) return;

    // If viewId already in router.query and not a system preset → getById query handles it.
    // Sync to session storage so navigating away and back restores the view.
    if (viewId && !isSystemPresetId(viewId as string)) {
      setStoredViewId(viewId as string);
      return;
    }

    // Already dispatched a viewId via setSelectedViewId, waiting for router.query to update
    if (pendingResolveRef.current) return;

    // Clear stale system preset from URL (e.g. navigated from session detail)
    if (viewId && isSystemPresetId(viewId as string)) {
      handleSetViewId(null);
      // fall through to resolve from other sources
    }

    // Priority 1: Session storage (from a previous visit to this table)
    if (storedViewId && !isSystemPresetId(storedViewId)) {
      pendingResolveRef.current = true;
      setSelectedViewId(storedViewId);
      return; // router.query updates next render → early return above → getById fires
    }

    // Priority 2: Default view (wait for query to resolve)
    if (isDefaultLoading) return;

    if (defaultViewId) {
      if (isSystemPresetId(defaultViewId)) {
        // System presets don't need data fetching, initialize immediately
        setSelectedViewId(defaultViewId);
        setIsInitialized(true);
        setIsLoading(false);
        return;
      }
      pendingResolveRef.current = true;
      setStoredViewId(defaultViewId);
      setSelectedViewId(defaultViewId);
      return; // router.query updates next render → early return above → getById fires
    }

    // Priority 3: Nothing to apply
    setIsInitialized(true);
    setIsLoading(false);
  }, [
    viewId,
    isInitialized,
    storedViewId,
    isDefaultLoading,
    defaultViewId,
    handleSetViewId,
    setStoredViewId,
    setSelectedViewId,
  ]);

  // Fetch view data if viewId is provided (skip for system presets)
  const { data: viewData, error: viewError } =
    api.TableViewPresets.getById.useQuery(
      { viewId: viewId as string, projectId },
      {
        enabled:
          !!viewId && !isInitialized && !isSystemPresetId(viewId as string),
      },
    );

  // Method to apply state from a view
  const applyViewState = useCallback(
    (viewData: TableViewPresetDomain) => {
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
        );
      }

      // Validate and apply filters
      if (viewData.filters) {
        validFilters = validateFilters(
          viewData.filters,
          validationContext.filterColumnDefinition,
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

      if (setFiltersRef.current) {
        setFiltersRef.current(validFilters);
        // Track expected filters to observe when state actually updates (for useEffect below)
        // If filters are already applied, don't set pending ref (will unlock immediately)
        if (!filtersAlreadyApplied) {
          pendingFiltersRef.current = validFilters;
        }
      }

      // Handle search query (only set if non-empty to avoid use-query-params batching conflicts)
      if (viewData.searchQuery && setSearchQueryRef.current) {
        setSearchQueryRef.current(viewData.searchQuery);
      }

      // Apply column order and visibility without validation since UI will handle gracefully
      if (viewData.columnOrder) setColumnOrder(viewData.columnOrder);
      if (viewData.columnVisibility)
        setColumnVisibility(viewData.columnVisibility);

      // If filters were already applied, unlock table immediately
      if (filtersAlreadyApplied) {
        setIsLoading(false);
      }

      // NOTE: Table remains locked until useEffect observer detects filter state propagation
      // This is relevant for the saved views. Because the URL lazy updates and we don't want to wait
      // for a page reload
    },
    [
      setColumnOrder,
      setColumnVisibility,
      validationContext,
      currentFilterState,
    ],
  );

  // Handle successful view data fetch
  useEffect(() => {
    if (viewData && !isInitialized) {
      // Track permalink visit
      capture("saved_views:permalink_visit", {
        tableName,
        viewId: viewId as string,
        name: viewData.name,
      });

      applyViewState(viewData);
      setIsInitialized(true);
    }
  }, [
    viewData,
    isInitialized,
    capture,
    tableName,
    viewId,
    applyViewState,
    setIsLoading,
  ]);

  // Handle view data fetch error
  useEffect(() => {
    if (viewError && !isInitialized) {
      setIsInitialized(true);
      setIsLoading(false);
      handleSetViewId(null);
      showErrorToast("Error applying view", viewError.message, "WARNING");
    }
  }, [viewError, isInitialized, setIsLoading, handleSetViewId]);

  // Observe when filter state propagates from saved view
  // After calling setFilters, URL updates async → filterState recalculates → this effect detects completion
  useEffect(() => {
    if (pendingFiltersRef.current && currentFilterState) {
      if (isEqual(currentFilterState, pendingFiltersRef.current)) {
        // Filter state has synchronized - safe to unlock table
        pendingFiltersRef.current = null;
        setIsLoading(false);
      }
    }
  }, [currentFilterState]);

  return {
    isLoading,
    applyViewState,
    handleSetViewId,
    selectedViewId,
    defaultViewScope: resolvedDefault?.scope as DefaultViewScope | null,
  };
}
