import { useCallback, useMemo } from "react";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { type FilterState } from "@langfuse/shared";
import { computeSelectedValues } from "../lib/filter-query-encoding";
import {
  decodeTraceFilters,
  encodeTraceFilters,
  getTraceShortKey as getShortKey,
  type TraceFilterQueryOptions as FilterQueryOptions,
  applyTraceFilterSelection,
} from "@/src/components/table/utils/trace-query-filter-encoding";
import useSessionStorage from "@/src/components/useSessionStorage";

type UIFilter = {
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
};

const FILTER_EXPANDED_STORAGE_KEY = "trace-filters-expanded";
const DEFAULT_EXPANDED_FILTERS = ["name"];
const EMPTY_MAP: Map<string, number> = new Map();

type UpdateFilter = (
  column: string,
  values: string[],
  operator?: "any of" | "none of",
) => void;

export function useQueryFilterStateNew(options: FilterQueryOptions) {
  const [expandedString, setExpandedString] = useSessionStorage<string>(
    FILTER_EXPANDED_STORAGE_KEY,
    DEFAULT_EXPANDED_FILTERS.join(","),
  );
  const expandedState = useMemo(() => {
    return expandedString.split(",").filter(Boolean);
  }, [expandedString]);
  const onExpandedChange = useCallback(
    (value: string[]) => {
      setExpandedString(value.join(","));
    },
    [setExpandedString],
  );

  const [filtersQuery, setFiltersQuery] = useQueryParam(
    "filternew",
    withDefault(StringParam, ""),
  );

  const filterState: FilterState = useMemo(() => {
    try {
      return decodeTraceFilters(filtersQuery, options);
    } catch (error) {
      console.error("Error decoding filters:", error);
      return [];
    }
  }, [filtersQuery, options]);

  const setFilterState = useCallback(
    (newFilters: FilterState) => {
      const encoded = encodeTraceFilters(newFilters, options);
      setFiltersQuery(encoded || null);
    },
    [options, setFiltersQuery],
  );

  const clearAll = () => {
    setFilterState([]);
  };

  const updateFilter: UpdateFilter = useCallback(
    (column, values, operator?: "any of" | "none of") => {
      const next = applyTraceFilterSelection({
        current: filterState,
        column,
        values,
        options,
        operator,
      });
      setFilterState(next);
    },
    [filterState, options, setFilterState],
  );

  const updateFilterOnly = useCallback(
    (column: string, value: string) => {
      // For "only this" behavior - always use "any of" operator with single value
      if (column === "bookmarked") {
        // Handle bookmarked specially
        updateFilter(column, [value]);
        return;
      }

      if (!(column in options)) return;
      updateFilter(column, [value], "any of");
    },
    [options, updateFilter],
  );

  const filters: UIFilter[] = useMemo((): UIFilter[] => {
    const filterByColumn = new Map(filterState.map((f) => [f.column, f]));
    const expandedSet = new Set(expandedState);

    const availableNames = options.name ?? [];
    const selectedNames = computeSelectedValues(
      availableNames,
      filterByColumn.get("name"),
    );
    const nameCounts = EMPTY_MAP;
    const nameFilter: UIFilter = {
      column: "name",
      label: "Name",
      shortKey: getShortKey("name"),
      value: selectedNames,
      options: availableNames,
      counts: nameCounts,
      loading: false,
      expanded: expandedSet.has("name"),
      onChange: (values: string[]) => updateFilter("name", values),
      onOnlyChange: (value: string) => {
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

    const availableTags = options.tags ?? [];
    const selectedTags = computeSelectedValues(
      availableTags,
      filterByColumn.get("tags"),
    );
    const tagsFilter: UIFilter = {
      column: "tags",
      label: "Tags",
      shortKey: getShortKey("tags"),
      value: selectedTags,
      options: availableTags,
      counts: EMPTY_MAP,
      loading: false,
      expanded: expandedSet.has("tags"),
      onChange: (values: string[]) => updateFilter("tags", values),
      onOnlyChange: (value: string) => {
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

    const availableLevels = options.level ?? [
      "DEFAULT",
      "DEBUG",
      "WARNING",
      "ERROR",
    ];
    const selectedLevels = computeSelectedValues(
      availableLevels,
      filterByColumn.get("level"),
    );
    const levelFilter: UIFilter = {
      column: "level",
      label: "Level",
      shortKey: getShortKey("level"),
      value: selectedLevels,
      options: availableLevels,
      counts: EMPTY_MAP,
      loading: false,
      expanded: expandedSet.has("level"),
      onChange: (values: string[]) => updateFilter("level", values),
      onOnlyChange: (value: string) => {
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

    const availableEnvironments = options.environment ?? [];
    const selectedEnvironments = computeSelectedValues(
      availableEnvironments,
      filterByColumn.get("environment"),
    );
    const environmentFilter: UIFilter = {
      column: "environment",
      label: "Environment",
      shortKey: getShortKey("environment"),
      value: selectedEnvironments,
      options: availableEnvironments,
      counts: EMPTY_MAP,
      loading: false,
      expanded: expandedSet.has("environment"),
      onChange: (values: string[]) => updateFilter("environment", values),
      onOnlyChange: (value: string) => {
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

    const availableBookmarkedOptions = options.bookmarked ?? [
      "Bookmarked",
      "Not bookmarked",
    ];
    const bookmarkedFilterState = filterByColumn.get("bookmarked");
    let selectedBookmarkedOptions = availableBookmarkedOptions;
    if (bookmarkedFilterState) {
      const boolValue = bookmarkedFilterState.value as boolean;
      selectedBookmarkedOptions =
        boolValue === true ? ["Bookmarked"] : ["Not bookmarked"];
    }
    const bookmarkedFilter: UIFilter = {
      column: "bookmarked",
      label: "Bookmarked",
      shortKey: getShortKey("bookmarked"),
      value: selectedBookmarkedOptions,
      options: availableBookmarkedOptions,
      counts: EMPTY_MAP,
      loading: false,
      expanded: expandedSet.has("bookmarked"),
      onChange: (values: string[]) => {
        if (values.length === 0 || values.length === 2) {
          updateFilter("bookmarked", []);
          return;
        }
        if (
          values.includes("Bookmarked") &&
          !values.includes("Not bookmarked")
        ) {
          updateFilter("bookmarked", ["Bookmarked"]);
        } else if (
          values.includes("Not bookmarked") &&
          !values.includes("Bookmarked")
        ) {
          updateFilter("bookmarked", ["Not bookmarked"]);
        }
      },
      onOnlyChange: (value: string) => {
        if (
          selectedBookmarkedOptions.length === 1 &&
          selectedBookmarkedOptions.includes(value)
        ) {
          updateFilter("bookmarked", []);
        } else {
          updateFilter("bookmarked", [value]);
        }
      },
    };

    return [
      environmentFilter,
      bookmarkedFilter,
      nameFilter,
      tagsFilter,
      levelFilter,
    ];
  }, [options, filterState, updateFilter, updateFilterOnly, expandedState]);

  return {
    filterState,
    updateFilter,
    updateFilterOnly,
    clearAll,
    isFiltered: filterState.length > 0,
    filters,
    expanded: expandedState,
    onExpandedChange,
  };
}
