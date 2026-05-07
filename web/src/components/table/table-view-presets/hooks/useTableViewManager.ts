import { api } from "@/src/utils/api";
import {
  TableViewPresetTableName,
  type FilterState,
  type OrderByState,
  type TableViewPresetState,
  type ColumnDefinition,
} from "@langfuse/shared";
import { useRouter } from "next/router";
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

interface TableStateUpdaters {
  setColumnOrder: (columnOrder: string[]) => void;
  setColumnVisibility: (columnVisibility: VisibilityState) => void;
  setOrderBy?: (orderBy: OrderByState) => void;
  setFilters?: (filters: FilterState) => void;
  setSearchQuery?: (searchQuery: string) => void;
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
  };
  currentFilterState?: FilterState;
  currentExpandedFilters?: string[];
  disabled?: boolean;
}

const isViewApplicableToTable = (
  currentTableName: TableViewPresetTableName,
  viewTableName: TableViewPresetTableName,
) =>
  currentTableName === viewTableName ||
  (currentTableName === TableViewPresetTableName.ObservationsEvents &&
    viewTableName === TableViewPresetTableName.Observations);

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
}: UseTableStateProps) {
  const router = useRouter();
  const isRouterReady = router.isReady;
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const capture = usePostHogClientCapture();
  const pendingFiltersRef = useRef<FilterState | null>(null);
  const pendingFiltersPreviousStateRef = useRef<FilterState | null>(null);

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

    // If viewId already in the URL and is not a system preset, let the getById
    // query resolve it.
    if (selectedViewId && !isSystemPresetId(selectedViewId)) {
      return;
    }

    // Clear stale system preset from URL (e.g. navigated from session detail).
    if (selectedViewId && isSystemPresetId(selectedViewId)) {
      handleSetViewId(null);
      return;
    }

    // Priority 1: Session storage (from a previous visit to this table)
    if (storedViewId && !isSystemPresetId(storedViewId)) {
      setSelectedViewId(storedViewId);
      return;
    }

    // Priority 2: Default view (wait for query to resolve)
    if (isDefaultLoading) return;

    if (defaultViewId) {
      if (isSystemPresetId(defaultViewId)) {
        // Resolved defaults should never point to system presets; clear if they do.
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
    storedViewId,
    isDefaultLoading,
    defaultViewId,
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

      if (setFiltersRef.current) {
        setFiltersRef.current(validFilters);
        // Track expected filters to observe when state actually updates (for useEffect below)
        // If filters are already applied, don't set pending ref (will unlock immediately).
        // Also track pre-apply state so we can unlock when filters propagate but get
        // canonicalized into an equivalent shape by downstream hooks.
        if (!filtersAlreadyApplied) {
          pendingFiltersRef.current = validFilters;
          pendingFiltersPreviousStateRef.current = currentFilterState ?? [];
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
      currentExpandedFilters,
    ],
  );

  // Fetch view data if viewId is provided (skip for system presets)
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
        !isSystemPresetId(selectedViewId),
    },
  );

  useEffect(() => {
    if (disabled) return;
    if (!isSelectedViewSuccess || !selectedViewData) return;
    const requestedViewId = selectedViewId;
    if (!requestedViewId) return;
    if (isInitializedRef.current) return;
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

  // Observe when filter state propagates from saved view
  // After calling setFilters, URL updates async → filterState recalculates → this effect detects completion
  useEffect(() => {
    const pendingFilters = pendingFiltersRef.current;
    if (!pendingFilters || currentFilterState === undefined) return;

    const preApplyFilters = pendingFiltersPreviousStateRef.current ?? [];
    const hasExpectedShape = isEqual(currentFilterState, pendingFilters);
    const hasPropagatedWithCanonicalization = !isEqual(
      currentFilterState,
      preApplyFilters,
    );

    if (hasExpectedShape || hasPropagatedWithCanonicalization) {
      // Filter state has synchronized - safe to unlock table.
      // `hasPropagatedWithCanonicalization` handles equivalent rewrites
      // (for example legacy env-delta -> canonical none-of shape).
      pendingFiltersRef.current = null;
      pendingFiltersPreviousStateRef.current = null;
      setIsLoading(false);
    }
  }, [currentFilterState]);

  if (disabled) {
    return {
      isLoading: false,
      applyViewState: () => {},
      handleSetViewId: () => {},
      selectedViewId: null,
      defaultViewScope: null,
    };
  }

  return {
    isLoading,
    applyViewState,
    handleSetViewId,
    selectedViewId,
    defaultViewScope: resolvedDefault?.scope ?? null,
  };
}
