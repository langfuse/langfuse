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
import { isEqual } from "lodash";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { validateOrderBy, validateFilters } from "../validation";

interface TableStateUpdaters {
  setColumnOrder: (columnOrder: string[]) => void;
  setColumnVisibility: (columnVisibility: VisibilityState) => void;
  setOrderBy?: (orderBy: OrderByState) => void;
  setFilters?: (filters: FilterState) => void;
  setFiltersDirectly?: (filters: FilterState) => void; // Bypass URL encoding for programmatic updates
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

function isFunction(fn: unknown): fn is (...args: unknown[]) => void {
  return typeof fn === "function";
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
      setStoredViewId(viewId);
      setSelectedViewId(viewId);
    },
    [setStoredViewId, setSelectedViewId],
  );

  // Extract updater functions and store in refs to avoid stale closures
  const {
    setOrderBy,
    setFilters,
    setFiltersDirectly,
    setColumnOrder,
    setColumnVisibility,
    setSearchQuery,
  } = stateUpdaters;

  // Use refs to always get latest function references
  const setFiltersRef = useRef(setFilters);
  const setFiltersDirectlyRef = useRef(setFiltersDirectly);
  const setOrderByRef = useRef(setOrderBy);
  const setSearchQueryRef = useRef(setSearchQuery);

  // Always update refs immediately (not in useEffect)
  setFiltersRef.current = setFilters;
  setFiltersDirectlyRef.current = setFiltersDirectly;
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

  // Fetch view data if viewId is provided
  const {
    data: viewData,
    isLoading: isViewLoading,
    error: viewError,
  } = api.TableViewPresets.getById.useQuery(
    { viewId: viewId as string, projectId },
    {
      enabled: !!viewId && !isInitialized,
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

      if (setFiltersRef.current) {
        console.log(
          "DEBUG: About to call setFiltersRef.current with:",
          JSON.stringify(validFilters),
        );
        setFiltersRef.current(validFilters);
        console.log("DEBUG: setFiltersRef.current call completed");
        // Track expected filters to observe when state actually updates
        pendingFiltersRef.current = validFilters;
        console.log(
          "DEBUG: pendingFiltersRef set to:",
          JSON.stringify(validFilters),
        );
      }

      // Handle search query (only if it has a value - don't set empty string)
      if (viewData.searchQuery && setSearchQueryRef.current) {
        console.log("DEBUG: Setting searchQuery to:", viewData.searchQuery);
        setSearchQueryRef.current(viewData.searchQuery);
      } else {
        console.log(
          "DEBUG: NOT setting searchQuery (undefined or empty):",
          viewData.searchQuery,
        );
      }

      // Apply column order and visibility without validation since UI will handle gracefully
      if (viewData.columnOrder) setColumnOrder(viewData.columnOrder);
      if (viewData.columnVisibility)
        setColumnVisibility(viewData.columnVisibility);

      // Don't unlock here - let the useEffect below handle it after observing state update
    },
    [setColumnOrder, setColumnVisibility, validationContext],
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

      // Apply view state
      applyViewState(viewData);
      setIsInitialized(true);
      // Note: setIsLoading(false) is called inside applyViewState after state sync
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

  // Initialize on mount if no viewId
  useEffect(() => {
    if (!isInitialized && !isViewLoading && !viewId) {
      // No view to load - just mark as initialized
      // The individual state hooks will have their own defaults
      setIsInitialized(true);
      setIsLoading(false);
    }
  }, [isInitialized, isViewLoading, viewId]);

  // Elegant React solution: Observe when filter state actually updates
  // When loading a saved view, we set filters which update URL asynchronously.
  // This effect watches currentFilterState and unlocks when it matches what we set.
  useEffect(() => {
    console.log(
      "DEBUG: useEffect fired, currentFilterState:",
      JSON.stringify(currentFilterState),
    );
    console.log(
      "DEBUG: pendingFiltersRef.current:",
      JSON.stringify(pendingFiltersRef.current),
    );

    if (pendingFiltersRef.current && currentFilterState) {
      const matches = isEqual(currentFilterState, pendingFiltersRef.current);
      console.log("DEBUG: isEqual result:", matches);

      // Check if current filter state matches what we're expecting
      if (matches) {
        // State has propagated! Safe to unlock
        console.log("DEBUG: States match! Unlocking table");
        pendingFiltersRef.current = null;
        setIsLoading(false);
      } else {
        console.log("DEBUG: States don't match yet, staying locked");
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
