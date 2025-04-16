import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { type OrderByState, type FilterState } from "@langfuse/shared";
import {
  type ColumnOrderState,
  type VisibilityState,
} from "@tanstack/react-table";
import { api } from "@/src/utils/api";
import { useEffect } from "react";

interface UseViewStoreProps {
  // Optional setters for table state
  setOrderBy?: (value: OrderByState) => void;
  setFilters?: (value: FilterState) => void;
  setColumnOrder?: (value: ColumnOrderState) => void;
  setColumnVisibility?: (value: VisibilityState) => void;
  setSearchQuery?: (value: string) => void;
  tableName?: string;
  projectId?: string;
}

export const useViewStore = ({
  setOrderBy,
  setFilters,
  setColumnOrder,
  setColumnVisibility,
  setSearchQuery,
  tableName,
  projectId,
}: UseViewStoreProps = {}) => {
  const [selectedViewId, setSelectedViewIdParam] = useQueryParam(
    "viewId",
    withDefault(StringParam, null),
  );

  // Get view by id query
  const { data: viewData } = api.savedViews.getById.useQuery(
    { id: selectedViewId as string, projectId: projectId as string },
    {
      enabled: !!selectedViewId && !!projectId,
      // Don't refetch on window focus to prevent overriding user changes
      refetchOnWindowFocus: false,
    },
  );

  // Apply view configuration to the table
  const applyViewConfiguration = (view: any) => {
    if (!view) return;

    // Apply each configuration if the setter is provided
    if (setOrderBy && view.orderBy) {
      setOrderBy(view.orderBy);
    }

    if (setFilters && view.filters) {
      setFilters(view.filters);
    }

    if (setColumnOrder && view.columnOrder) {
      setColumnOrder(view.columnOrder);
    }

    if (setColumnVisibility && view.columnVisibility) {
      setColumnVisibility(view.columnVisibility);
    }

    if (setSearchQuery && view.searchQuery) {
      setSearchQuery(view.searchQuery);
    }
  };

  const handleSetSelectedViewId = (viewId: string) => {
    // Update the query param
    setSelectedViewIdParam(viewId);
  };

  // Use effect to apply configuration when viewData changes
  useEffect(() => {
    if (viewData && selectedViewId === viewData.id) {
      applyViewConfiguration(viewData);
    }
  }, [viewData, selectedViewId]);

  return {
    selectedViewId,
    setSelectedViewId: handleSetSelectedViewId,
  };
};
