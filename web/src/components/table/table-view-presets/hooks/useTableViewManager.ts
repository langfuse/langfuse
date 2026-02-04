import { api } from "@/src/utils/api";
import {
  type TableViewPresetTableName,
  type FilterState,
  type OrderByState,
  type TableViewPresetDomain,
  type ColumnDefinition,
} from "@langfuse/shared";
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

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewIdInUrl = urlParams.get("viewId");

    // If no viewId in URL but we have one in storage, use that
    if (!viewIdInUrl && storedViewId) {
      setSelectedViewId(storedViewId);
    }
    // If there's a viewId in the URL, update our storage
    else if (viewIdInUrl) {
      setStoredViewId(viewIdInUrl);
    } else {
      setIsLoading(false);
      setIsInitialized(true);
    }
  }, [storedViewId, setStoredViewId, setSelectedViewId]);

  // Fetch view data if viewId is provided (skip for system presets)
  const {
    data: viewData,
    isLoading: isViewLoading,
    error: viewError,
  } = api.TableViewPresets.getById.useQuery(
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

  // Initialize on mount if no viewId (or if viewId is a system preset from another page)
  useEffect(() => {
    const shouldSkipViewId = !viewId || isSystemPresetId(viewId as string);
    if (!isInitialized && !isViewLoading && shouldSkipViewId) {
      // No view to load (or system preset which is page-specific) - just mark as initialized
      // The individual state hooks will have their own defaults
      // Clear any stale system preset ID from URL
      if (isSystemPresetId(viewId as string)) {
        handleSetViewId(null);
      }
      setIsInitialized(true);
      setIsLoading(false);
    }
  }, [isInitialized, isViewLoading, viewId, handleSetViewId]);

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
  };
}
