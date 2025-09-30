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

function computeNumericRange(
  column: string,
  filterState: FilterState,
  defaultMin: number,
  defaultMax: number,
): [number, number] {
  const minFilter = filterState.find(
    (f) => f.column === column && f.type === "number" && f.operator === ">=",
  );
  const maxFilter = filterState.find(
    (f) => f.column === column && f.type === "number" && f.operator === "<=",
  );

  const minValue =
    minFilter && typeof minFilter.value === "number"
      ? minFilter.value
      : defaultMin;
  const maxValue =
    maxFilter && typeof maxFilter.value === "number"
      ? maxFilter.value
      : defaultMax;

  return [minValue, maxValue];
}

interface BaseUIFilter {
  column: string;
  label: string;
  shortKey: string | null;
  loading: boolean;
  expanded: boolean;
}

interface CategoricalUIFilter extends BaseUIFilter {
  type: "categorical";
  value: string[];
  options: string[];
  counts: Map<string, number>;
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
}

interface NumericUIFilter extends BaseUIFilter {
  type: "numeric";
  value: [number, number];
  min: number;
  max: number;
  onChange: (value: [number, number]) => void;
  unit?: string;
}

type UIFilter = CategoricalUIFilter | NumericUIFilter;

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

  const updateNumericFilter = useCallback(
    (
      column: string,
      value: [number, number],
      defaultMin: number,
      defaultMax: number,
    ) => {
      // Remove existing numeric filters for this column
      const withoutNumeric = filterState.filter((f) => f.column !== column);

      // Only add filters if values differ from defaults
      const filters: FilterState = [];
      if (value[0] !== defaultMin) {
        filters.push({
          column,
          type: "number" as const,
          operator: ">=" as const,
          value: value[0],
        });
      }
      if (value[1] !== defaultMax) {
        filters.push({
          column,
          type: "number" as const,
          operator: "<=" as const,
          value: value[1],
        });
      }

      const next: FilterState = [...withoutNumeric, ...filters];
      setFilterState(next);
    },
    [filterState, setFilterState],
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
      type: "categorical",
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
      type: "categorical",
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
      type: "categorical",
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
      type: "categorical",
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
      type: "categorical",
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

    const latencyMin = 0;
    // 1 minute–default for range slider, max can go higher in input
    const latencyMax = 60;
    const currentLatencyRange = computeNumericRange(
      "latency",
      filterState,
      latencyMin,
      latencyMax,
    );
    const latencyFilter: NumericUIFilter = {
      type: "numeric",
      column: "latency",
      label: "Latency",
      shortKey: getShortKey("latency"),
      value: currentLatencyRange,
      min: latencyMin,
      max: latencyMax,
      unit: "s",
      loading: false,
      expanded: expandedSet.has("latency"),
      onChange: (value: [number, number]) =>
        updateNumericFilter("latency", value, latencyMin, latencyMax),
    };

    return [
      environmentFilter,
      bookmarkedFilter,
      nameFilter,
      tagsFilter,
      levelFilter,
      latencyFilter,
    ];
  }, [
    options,
    filterState,
    updateFilter,
    updateFilterOnly,
    updateNumericFilter,
    expandedState,
  ]);

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
