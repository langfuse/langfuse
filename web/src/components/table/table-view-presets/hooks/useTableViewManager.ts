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
        setFiltersRef.current(validFilters);
        // Track expected filters to observe when state actually updates (for useEffect below)
        pendingFiltersRef.current = validFilters;
      }

      // Handle search query (only set if non-empty to avoid use-query-params batching conflicts)
      if (viewData.searchQuery && setSearchQueryRef.current) {
        setSearchQueryRef.current(viewData.searchQuery);
      }

      // Apply column order and visibility without validation since UI will handle gracefully
      if (viewData.columnOrder) setColumnOrder(viewData.columnOrder);
      if (viewData.columnVisibility)
        setColumnVisibility(viewData.columnVisibility);

      // Note: Table remains locked until useEffect observer detects filter state propagation
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

  // Initialize on mount if no viewId
  useEffect(() => {
    if (!isInitialized && !isViewLoading && !viewId) {
      // No view to load - just mark as initialized
      // The individual state hooks will have their own defaults
      setIsInitialized(true);
      setIsLoading(false);
    }
  }, [isInitialized, isViewLoading, viewId]);

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
