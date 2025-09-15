import { useMemo } from "react";
import { type FilterState } from "@langfuse/shared";
import { getShortKey } from "../lib/filter-query-encoding";
import useSessionStorage from "@/src/components/useSessionStorage";
import { api } from "@/src/utils/api";
import { skipToken } from "@tanstack/react-query";

interface UseUIFilterStateProps {
  filterState: FilterState;
  updateFilter: (
    column: string,
    values: any,
    operator?: "any of" | "none of",
  ) => void;
  updateFilterOnly: (column: string, value: string) => void;
  projectId?: string;
  options: FilterQueryOptions;
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
  onOnlyChange?: (value: string) => void;
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
  updateFilterOnly,
  projectId,
  options,
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

  // Fetch environment filter options
  const environmentOptionsQuery =
    api.projects.environmentFilterOptions.useQuery(
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
    const nameFilterState = filterState.find((f) => f.column === "name");

    // Get available names from the centralized query
    const availableNames =
      filterOptionsQuery.data?.name?.map((n) => n.value) || [];

    // Handle UI display based on filter operator
    let selectedNames: string[];
    if (!nameFilterState) {
      // No filter = show all as selected
      selectedNames = availableNames;
    } else if (nameFilterState.operator === "none of") {
      // Exclusive filter = show inverse (everything except the filtered values)
      selectedNames = availableNames.filter(
        (name) => !(nameFilterState.value as string[]).includes(name),
      );
    } else {
      // Inclusive filter = show exactly what's selected
      selectedNames = nameFilterState.value as string[];
    }

    const nameCounts = new Map(
      filterOptionsQuery.data?.name?.map((n) => [n.value, Number(n.count)]) ||
        [],
    );

    return {
      column: "name",
      label: "Name",
      shortKey: getShortKey("name"),
      value: selectedNames,
      options: availableNames,
      counts: nameCounts,
      loading: filterOptionsQuery.isLoading,
      expanded: expandedState.includes("name"),
      onChange: (values: string[]) => updateFilter("name", values),
      onOnlyChange: (value: string) => {
        // If this is the only selected item, deselect it instead
        if (selectedNames.length === 1 && selectedNames.includes(value)) {
          updateFilter(
            "name",
            selectedNames.filter((v) => v !== value),
          );
        } else {
          updateFilterOnly("name", value);
        }
      },
    };
  }, [
    filterState,
    updateFilter,
    updateFilterOnly,
    expandedState,
    filterOptionsQuery.data,
    filterOptionsQuery.isLoading,
  ]);

  // Tags filter
  const tagsFilter = useMemo((): UIFilter => {
    // Find selected values from filterState
    const tagsFilterState = filterState.find((f) => f.column === "tags");

    // Get available tags from the centralized query
    const availableTags =
      filterOptionsQuery.data?.tags?.map((t) => t.value) || [];

    // Handle UI display based on filter operator
    let selectedTags: string[];
    if (!tagsFilterState) {
      // No filter = show all as selected
      selectedTags = availableTags;
    } else if (tagsFilterState.operator === "none of") {
      // Exclusive filter = show inverse (everything except the filtered values)
      selectedTags = availableTags.filter(
        (tag) => !(tagsFilterState.value as string[]).includes(tag),
      );
    } else {
      // Inclusive filter = show exactly what's selected
      selectedTags = tagsFilterState.value as string[];
    }

    const tagsCounts = new Map(
      filterOptionsQuery.data?.tags?.map((t) => [t.value, Number(t.count)]) ||
        [],
    );

    return {
      column: "tags",
      label: "Tags",
      shortKey: getShortKey("tags"),
      value: selectedTags,
      options: availableTags,
      counts: tagsCounts,
      loading: filterOptionsQuery.isLoading,
      expanded: expandedState.includes("tags"),
      onChange: (values: string[]) => updateFilter("tags", values),
      onOnlyChange: (value: string) => {
        // If this is the only selected item, deselect it instead
        if (selectedTags.length === 1 && selectedTags.includes(value)) {
          updateFilter(
            "tags",
            selectedTags.filter((v) => v !== value),
          );
        } else {
          updateFilterOnly("tags", value);
        }
      },
    };
  }, [
    filterState,
    updateFilter,
    updateFilterOnly,
    expandedState,
    filterOptionsQuery.data,
    filterOptionsQuery.isLoading,
  ]);

  // Level filter
  const levelFilter = useMemo((): UIFilter => {
    const availableLevels = options.level || [
      "DEFAULT",
      "DEBUG",
      "WARNING",
      "ERROR",
    ];

    // Find selected values from filterState
    const levelFilterState = filterState.find((f) => f.column === "level");

    // Handle UI display based on filter operator
    let selectedLevels: string[];
    if (!levelFilterState) {
      // No filter = show all as selected
      selectedLevels = availableLevels;
    } else if (levelFilterState.operator === "none of") {
      // Exclusive filter = show inverse (everything except the filtered values)
      selectedLevels = availableLevels.filter(
        (level) => !(levelFilterState.value as string[]).includes(level),
      );
    } else {
      // Inclusive filter = show exactly what's selected
      selectedLevels = levelFilterState.value as string[];
    }

    return {
      column: "level",
      label: "Level",
      shortKey: getShortKey("level"),
      value: selectedLevels,
      options: availableLevels,
      counts: new Map(), // Level doesn't have counts from API yet
      loading: false,
      expanded: expandedState.includes("level"),
      onChange: (values: string[]) => updateFilter("level", values),
      onOnlyChange: (value: string) => {
        // If this is the only selected item, deselect it instead
        if (selectedLevels.length === 1 && selectedLevels.includes(value)) {
          updateFilter(
            "level",
            selectedLevels.filter((v) => v !== value),
          );
        } else {
          updateFilterOnly("level", value);
        }
      },
    };
  }, [filterState, updateFilter, updateFilterOnly, expandedState]);

  // Environment filter
  const environmentFilter = useMemo((): UIFilter => {
    // Find selected values from filterState
    const environmentFilterState = filterState.find(
      (f) => f.column === "environment",
    );

    // Get available environments from the environment query
    const availableEnvironments =
      environmentOptionsQuery.data?.map((env) => env.environment) || [];

    // Handle UI display based on filter operator
    let selectedEnvironments: string[];
    if (!environmentFilterState) {
      // No filter = show all as selected
      selectedEnvironments = availableEnvironments;
    } else if (environmentFilterState.operator === "none of") {
      // Exclusive filter = show inverse (everything except the filtered values)
      selectedEnvironments = availableEnvironments.filter(
        (env) => !(environmentFilterState.value as string[]).includes(env),
      );
    } else {
      // Inclusive filter = show exactly what's selected
      selectedEnvironments = environmentFilterState.value as string[];
    }

    const environmentCounts = new Map<string, number>(); // Environment query doesn't provide counts

    return {
      column: "environment",
      label: "Environment",
      shortKey: getShortKey("environment"),
      value: selectedEnvironments,
      options: availableEnvironments,
      counts: environmentCounts,
      loading: environmentOptionsQuery.isLoading,
      expanded: expandedState.includes("environment"),
      onChange: (values: string[]) => updateFilter("environment", values),
      onOnlyChange: (value: string) => {
        // If this is the only selected item, deselect it instead
        if (
          selectedEnvironments.length === 1 &&
          selectedEnvironments.includes(value)
        ) {
          updateFilter(
            "environment",
            selectedEnvironments.filter((v) => v !== value),
          );
        } else {
          updateFilterOnly("environment", value);
        }
      },
    };
  }, [
    filterState,
    updateFilter,
    updateFilterOnly,
    expandedState,
    environmentOptionsQuery.data,
    environmentOptionsQuery.isLoading,
  ]);

  // Bookmarked filter
  const bookmarkedFilter = useMemo((): UIFilter => {
    const availableBookmarkedOptions = ["Bookmarked", "Not bookmarked"];

    // Find boolean filter state and convert to checkbox options
    const bookmarkedFilterState = filterState.find(
      (f) => f.column === "bookmarked",
    );
    let selectedBookmarkedOptions = availableBookmarkedOptions; // Default to both selected (show all)

    if (bookmarkedFilterState) {
      if (bookmarkedFilterState.type === "boolean") {
        // Convert boolean filter to checkbox selection
        const boolValue = bookmarkedFilterState.value;
        selectedBookmarkedOptions =
          boolValue === true ? ["Bookmarked"] : ["Not bookmarked"];
      } else if (bookmarkedFilterState.type === "stringOptions") {
        // Already in checkbox format
        selectedBookmarkedOptions =
          (bookmarkedFilterState.value as string[]) ||
          availableBookmarkedOptions;
      }
    }

    return {
      column: "bookmarked",
      label: "Bookmarked",
      shortKey: getShortKey("bookmarked"),
      value: selectedBookmarkedOptions,
      options: availableBookmarkedOptions,
      counts: new Map(), // No counts for bookmarked filter
      loading: false,
      expanded: expandedState.includes("bookmarked"),
      onChange: (values: string[]) => {
        // Convert checkbox selection to boolean filter
        if (values.length === 0 || values.length === 2) {
          // Both or neither selected - remove filter (show all)
          updateFilter("bookmarked", []);
          return;
        }

        if (
          values.includes("Bookmarked") &&
          !values.includes("Not bookmarked")
        ) {
          // Only bookmarked selected - create boolean filter for true
          updateFilter("bookmarked", ["Bookmarked"]);
        } else if (
          values.includes("Not bookmarked") &&
          !values.includes("Bookmarked")
        ) {
          // Only not bookmarked selected - create boolean filter for false
          updateFilter("bookmarked", ["Not bookmarked"]);
        }
      },
    };
  }, [filterState, updateFilter, expandedState]);

  // Return filters array and expanded state
  return {
    filters: [
      environmentFilter,
      bookmarkedFilter,
      nameFilter,
      tagsFilter,
      levelFilter,
    ],
    expanded: expandedState,
    onExpandedChange,
  };
}
