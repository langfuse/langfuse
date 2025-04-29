import { api } from "@/src/utils/api";
import {
  type SavedViewTableName,
  type FilterState,
  type OrderByState,
  type SavedViewDomain,
  type ColumnDefinition,
} from "@langfuse/shared";
import { useRouter } from "next/router";
import { useEffect, useCallback, useState } from "react";
import { type VisibilityState } from "@tanstack/react-table";
import { StringParam, withDefault } from "use-query-params";
import useSessionStorage from "@/src/components/useSessionStorage";
import { useQueryParam } from "use-query-params";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import _ from "lodash";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

interface TableStateUpdaters {
  setOrderBy: (orderBy: OrderByState) => void;
  setFilters: (filters: FilterState) => void;
  setColumnOrder: (columnOrder: string[]) => void;
  setColumnVisibility: (columnVisibility: VisibilityState) => void;
  setSearchQuery?: (searchQuery: string) => void;
}

interface UseTableStateProps {
  tableName: SavedViewTableName;
  projectId: string;
  stateUpdaters: TableStateUpdaters;
  validationContext?: {
    columns?: LangfuseColumnDef<any, any>[];
    filterColumnDefinition?: ColumnDefinition[];
  };
}

function isFunction(fn: unknown): fn is (...args: unknown[]) => void {
  return typeof fn === "function";
}

/**
 * Validates if an orderBy state references valid columns
 */
export function validateOrderBy(
  orderBy: OrderByState | null,
  columns?: LangfuseColumnDef<any, any>[],
): OrderByState | null {
  if (!orderBy || !columns || columns.length === 0) return null;

  // Check if the column exists and supports sorting
  const isValid = columns.some(
    (col) => col.id === orderBy.column && col.enableSorting !== false,
  );
  return isValid ? orderBy : null;
}

/**
 * Validates if filters reference valid columns
 */
export function validateFilters(
  filters: FilterState,
  filterColumnDefinition?: ColumnDefinition[],
): FilterState {
  if (!filterColumnDefinition || filterColumnDefinition.length === 0)
    return filters;

  // Filter out invalid filters
  return filters.filter((filter) => {
    return filterColumnDefinition.some(
      (def) => def.id === filter.column || def.name === filter.column,
    );
  });
}

/**
 * Hook to manage table view state with permalink support
 */
export function useTableViewManager({
  projectId,
  tableName,
  stateUpdaters,
  validationContext = {},
}: UseTableStateProps) {
  const router = useRouter();
  const { viewId } = router.query;
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const capture = usePostHogClientCapture();

  const [storedViewId, setStoredViewId] = useSessionStorage<string | null>(
    `${tableName}-${projectId}-viewId`,
    null,
  );
  const [selectedViewId, setSelectedViewId] = useQueryParam(
    "viewId",
    withDefault(StringParam, storedViewId),
  );

  // Keep track of the viewId in session storage and in the query params
  const handleSetViewId = (viewId: string | null) => {
    setStoredViewId(viewId);
    setSelectedViewId(viewId);
  };

  // Extract updater functions
  const {
    setOrderBy,
    setFilters,
    setColumnOrder,
    setColumnVisibility,
    setSearchQuery,
  } = stateUpdaters;

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
  const { isLoading: isViewLoading } = api.savedViews.getById.useQuery(
    { viewId: viewId as string, projectId },
    {
      enabled: !!viewId && !isInitialized,
      onSuccess: (data) => {
        if (data) {
          // Track permalink visit
          capture("saved_views:permalink_visit", {
            tableName,
            viewId: viewId as string,
            name: data.name,
          });

          // Apply view state
          applyViewState(data);
        }
        setIsInitialized(true);
        setIsLoading(false);
      },
      onError: () => {
        setIsInitialized(true);
        setIsLoading(false);
      },
    },
  );

  // Method to apply state from a view
  const applyViewState = useCallback(
    (viewData: SavedViewDomain) => {
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
        !_.isEqual(validOrderBy, viewData.orderBy) ||
        validFilters.length !== viewData.filters.length
      ) {
        showErrorToast(
          "Outdated view",
          "This view is outdated. Some old filters or ordering may have been ignored. Please update your view.",
          "WARNING",
        );
      }

      setOrderBy(validOrderBy);
      setFilters(validFilters);

      // Handle search query
      if (viewData.searchQuery !== undefined && isFunction(setSearchQuery)) {
        setSearchQuery(viewData.searchQuery);
      }

      // Apply column order and visibility without validation since UI will handle gracefully
      if (viewData.columnOrder) setColumnOrder(viewData.columnOrder);
      if (viewData.columnVisibility)
        setColumnVisibility(viewData.columnVisibility);
    },
    [
      setOrderBy,
      setFilters,
      setColumnOrder,
      setColumnVisibility,
      setSearchQuery,
      validationContext,
    ],
  );

  // Initialize on mount if no viewId
  useEffect(() => {
    if (!isInitialized && !isViewLoading && !viewId) {
      // No view to load - just mark as initialized
      // The individual state hooks will have their own defaults
      setIsInitialized(true);
      setIsLoading(false);
    }
  }, [isInitialized, isViewLoading, viewId]);

  return {
    isLoading,
    applyViewState,
    handleSetViewId,
    selectedViewId,
  };
}
