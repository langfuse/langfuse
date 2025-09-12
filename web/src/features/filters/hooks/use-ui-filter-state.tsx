import { useMemo } from "react";
import { type FilterState } from "@langfuse/shared";
import { getShortKey } from "../lib/filter-query-encoding";
import useSessionStorage from "@/src/components/useSessionStorage";

interface UseUIFilterStateProps {
  filterState: FilterState;
  updateFilter: (column: string, values: any) => void;
  projectId?: string;
}

interface UIFilter {
  column: string;
  label: string;
  shortKey: string | null;
  selected: string[];
  available: string[];
  loading: boolean;
  update: (values: string[]) => void;
}

// Session storage key for all filter expanded states
const FILTER_EXPANDED_STORAGE_KEY = "trace-filters-expanded";
const DEFAULT_EXPANDED_FILTERS = ["level"];

interface UIFilterStateReturn {
  filters: UIFilter[];
  expanded: string[];
  onExpandedChange: (value: string[]) => void;
}

export function useUIFilterState({
  filterState,
  updateFilter,
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

  // For now, only handle level filter
  const levelFilter = useMemo((): UIFilter => {
    const availableLevels = ["DEFAULT", "DEBUG", "WARNING", "ERROR"];

    // Find selected values from filterState
    const levelFilterState = filterState.find((f) => f.column === "level");
    const selectedLevels =
      (levelFilterState?.value as string[]) || availableLevels;

    return {
      column: "level",
      label: "Level",
      shortKey: getShortKey("level"),
      selected: selectedLevels,
      available: availableLevels,
      loading: false,
      update: (values: string[]) => updateFilter("level", values),
    };
  }, [filterState, updateFilter]);

  // Return filters array and expanded state
  return {
    filters: [levelFilter],
    expanded: expandedState,
    onExpandedChange,
  };
}
