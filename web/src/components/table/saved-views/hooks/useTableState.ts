import { api } from "@/src/utils/api";
import {
  type TableName,
  type FilterState,
  type OrderByState,
} from "@langfuse/shared";
import { useRouter } from "next/router";
import { useEffect, useCallback, useState } from "react";
import { type VisibilityState } from "@tanstack/react-table";
import { type SavedViewDomain } from "@langfuse/shared/src/server";

interface TableStateUpdaters {
  setOrderBy: (orderBy: OrderByState) => void;
  setFilters: (filters: FilterState) => void;
  setColumnOrder: (columnOrder: string[]) => void;
  setColumnVisibility: (columnVisibility: VisibilityState) => void;
  setSearchQuery: (searchQuery: string) => void;
}

interface UseTableStateProps {
  tableName: TableName;
  projectId: string;
  stateUpdaters: TableStateUpdaters;
}

/**
 * Hook to manage table view state with permalink support
 */
export function useTableState({
  projectId,
  stateUpdaters,
}: UseTableStateProps) {
  const router = useRouter();
  const { viewId } = router.query;
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(!!viewId);

  // Extract updater functions
  const {
    setOrderBy,
    setFilters,
    setColumnOrder,
    setColumnVisibility,
    setSearchQuery,
  } = stateUpdaters;

  console.log("viewId", viewId, isInitialized);

  // Fetch view data if viewId is provided
  const { isLoading: isViewLoading } = api.savedViews.getById.useQuery(
    { viewId: viewId as string, projectId },
    {
      enabled: !!viewId && !isInitialized,
      onSuccess: (data) => {
        console.log("data", data);
        if (data) {
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
      // Only update if values exist in the view data
      if (viewData.orderBy) setOrderBy(viewData.orderBy);
      if (viewData.filters) setFilters(viewData.filters);
      if (viewData.columnOrder) setColumnOrder(viewData.columnOrder);
      if (viewData.columnVisibility)
        setColumnVisibility(viewData.columnVisibility);
      if (viewData.searchQuery !== undefined)
        setSearchQuery(viewData.searchQuery);
    },
    [
      setOrderBy,
      setFilters,
      setColumnOrder,
      setColumnVisibility,
      setSearchQuery,
    ],
  );

  // Method to programmatically update from a view ID
  const handleApplyView = useCallback(
    async (newViewId: string) => {
      if (!newViewId) return;

      setIsLoading(true);

      try {
        const { data: savedView } = api.savedViews.getById.useQuery({
          projectId,
          viewId: newViewId,
        });

        if (savedView) {
          applyViewState(savedView);
        }
      } catch (error) {
        console.error("Failed to load view:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, applyViewState],
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
    handleApplyView,
  };
}
