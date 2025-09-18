import { useState } from "react";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import {
  type TableDateRangeAggregationOption,
  type TableDateRange,
  getDateFromOption,
  getAbbreviatedTimeRange,
  getFullTimeRangeFromAbbreviated,
  isValidTableDateRangeAggregationOption,
} from "@/src/utils/date-range-utils";
import useSessionStorage from "@/src/components/useSessionStorage";

export interface UseTableDateRangeOutput {
  selectedOption: TableDateRangeAggregationOption | null;
  dateRange: TableDateRange | undefined;
  setDateRangeAndOption: (
    option: TableDateRangeAggregationOption | null,
    range?: TableDateRange,
  ) => void;
}

export function useTableDateRange(projectId: string): UseTableDateRangeOutput {
  const [queryParams, setQueryParams] = useQueryParams({
    dateRange: withDefault(StringParam, "Select a date range"),
  });

  const defaultDateRange: TableDateRangeAggregationOption = "last1Day";

  // Try multiple formats for backward compatibility:
  // 1. Abbreviated format (new URLs): "1d" -> "last1Day"
  // 2. Variable name format (current): "last1Day"
  // 3. Custom timestamp range: "timestampA-timestampB"
  const rangeFromAbbreviated = queryParams.dateRange
    ? getFullTimeRangeFromAbbreviated(queryParams.dateRange)
    : null;

  // Check if dateRange is in timestamp format (contains a dash and valid timestamps)
  const isTimestampRange =
    queryParams.dateRange?.includes("-") &&
    !isValidTableDateRangeAggregationOption(queryParams.dateRange);

  const validatedInitialRangeOption = isTimestampRange
    ? null
    : rangeFromAbbreviated &&
        isValidTableDateRangeAggregationOption(rangeFromAbbreviated)
      ? rangeFromAbbreviated
      : isValidTableDateRangeAggregationOption(queryParams.dateRange)
        ? (queryParams.dateRange as TableDateRangeAggregationOption)
        : defaultDateRange;

  const [selectedOptionRaw, setSelectedOptionRaw] =
    useSessionStorage<TableDateRangeAggregationOption | null>(
      `tableDateRangeState-${projectId}`,
      validatedInitialRangeOption,
    );

  const selectedOption =
    selectedOptionRaw === null
      ? null
      : isValidTableDateRangeAggregationOption(selectedOptionRaw)
        ? selectedOptionRaw
        : defaultDateRange;

  const dateFromOption = selectedOption
    ? getDateFromOption({
        filterSource: "TABLE",
        option: selectedOption,
      })
    : null;

  const initialDateRange =
    isTimestampRange && queryParams.dateRange
      ? (() => {
          const [fromStr, toStr] = queryParams.dateRange.split("-");
          return {
            from: new Date(fromStr),
            to: new Date(toStr),
          };
        })()
      : !!dateFromOption
        ? { from: dateFromOption }
        : undefined;

  const [dateRange, setDateRange] = useState<TableDateRange | undefined>(
    initialDateRange,
  );
  const setDateRangeAndOption = (
    option: TableDateRangeAggregationOption | null,
    range?: TableDateRange,
  ) => {
    setSelectedOptionRaw(option);
    setDateRange(range);

    const isCustom = option === null;
    const newParam =
      isCustom && range && range.to
        ? `${range.from.toISOString()}-${range.to.toISOString()}`
        : isCustom && range
          ? range.from.toISOString() // Backward compatibility: single timestamp for tables with only 'from'
          : option
            ? getAbbreviatedTimeRange(option)
            : "1d"; // fallback

    setQueryParams({ dateRange: newParam });
  };

  return { selectedOption, dateRange, setDateRangeAndOption };
}
