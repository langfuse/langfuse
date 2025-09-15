import { useMemo } from "react";
import { type FilterState } from "@langfuse/shared";
import { getShortKey } from "../lib/filter-query-encoding";
import useSessionStorage from "@/src/components/useSessionStorage";
import { api } from "@/src/utils/api";
import { skipToken } from "@tanstack/react-query";

interface UseUIFilterStateProps {
  filterState: FilterState;
  updateFilter: (column: string, values: any) => void;
  projectId?: string;
}

interface UIFilter {
  column: string;
  label: string;
  shortKey: string | null;
  value: string[];
  options: string[];
  counts: Map<string, number>;
  loading: boolean;
  expanded: boolean;
  onChange: (values: string[]) => void;
}

// Session storage key for all filter expanded states
const FILTER_EXPANDED_STORAGE_KEY = "trace-filters-expanded";
const DEFAULT_EXPANDED_FILTERS = ["name"];

interface UIFilterStateReturn {
  filters: UIFilter[];
  expanded: string[];
  onExpandedChange: (value: string[]) => void;
}

export function useUIFilterState({
  filterState,
  updateFilter,
  projectId,
}: UseUIFilterStateProps): UIFilterStateReturn {
  // Use existing session storage hook with comma-separated string
  const [expandedString, setExpandedString] = useSessionStorage<string>(
    FILTER_EXPANDED_STORAGE_KEY,
    DEFAULT_EXPANDED_FILTERS.join(","),
  );

  // Convert comma-separated string to array
  const expandedState = useMemo(() => {
    return expandedString.split(",").filter(Boolean);
  }, [expandedString]);

  // Handle expanded state changes
  const onExpandedChange = (value: string[]) => {
    setExpandedString(value.join(","));
  };

  // Fetch filter options for all filters
  const filterOptionsQuery = api.traces.filterOptions.useQuery(
    projectId ? { projectId } : skipToken,
    {
      enabled: Boolean(projectId),
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  // Name filter
  const nameFilter = useMemo((): UIFilter => {
    // Find selected values from filterState
    const nameFilterState = filterState.find((f) => f.column === "Name");
    const selectedNames = (nameFilterState?.value as string[]) || [];

    // Get available names from the centralized query
    const availableNames =
      filterOptionsQuery.data?.name?.map((n) => n.value) || [];
    const nameCounts = new Map(
      filterOptionsQuery.data?.name?.map((n) => [n.value, Number(n.count)]) ||
        [],
    );

    return {
      column: "Name",
      label: "Name",
      shortKey: getShortKey("Name"),
      value: selectedNames,
      options: availableNames,
      counts: nameCounts,
      loading: filterOptionsQuery.isLoading,
      expanded: expandedState.includes("name"),
      onChange: (values: string[]) => updateFilter("Name", values),
    };
  }, [
    filterState,
    updateFilter,
    expandedState,
    filterOptionsQuery.data,
    filterOptionsQuery.isLoading,
  ]);

  // Tags filter
  const tagsFilter = useMemo((): UIFilter => {
    // Find selected values from filterState
    const tagsFilterState = filterState.find((f) => f.column === "Tags");
    const selectedTags = (tagsFilterState?.value as string[]) || [];

    // Get available tags from the centralized query
    const availableTags =
      filterOptionsQuery.data?.tags?.map((t) => t.value) || [];
    const tagsCounts = new Map(
      filterOptionsQuery.data?.tags?.map((t) => [t.value, Number(t.count)]) ||
        [],
    );

    return {
      column: "Tags",
      label: "Tags",
      shortKey: getShortKey("Tags"),
      value: selectedTags,
      options: availableTags,
      counts: tagsCounts,
      loading: filterOptionsQuery.isLoading,
      expanded: expandedState.includes("tags"),
      onChange: (values: string[]) => updateFilter("Tags", values),
    };
  }, [
    filterState,
    updateFilter,
    expandedState,
    filterOptionsQuery.data,
    filterOptionsQuery.isLoading,
  ]);

  // Level filter
  const levelFilter = useMemo((): UIFilter => {
    const availableLevels = ["DEFAULT", "DEBUG", "WARNING", "ERROR"];

    // Find selected values from filterState
    const levelFilterState = filterState.find((f) => f.column === "Level");
    const selectedLevels =
      (levelFilterState?.value as string[]) || availableLevels;

    return {
      column: "Level",
      label: "Level",
      shortKey: getShortKey("Level"),
      value: selectedLevels,
      options: availableLevels,
      counts: new Map(), // Level doesn't have counts from API yet
      loading: false,
      expanded: expandedState.includes("level"),
      onChange: (values: string[]) => updateFilter("Level", values),
    };
  }, [filterState, updateFilter, expandedState]);

  // Return filters array and expanded state
  return {
    filters: [nameFilter, tagsFilter, levelFilter],
    expanded: expandedState,
    onExpandedChange,
  };
}
