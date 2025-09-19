import { useState } from "react";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import {
  type TableDateRangeAggregationOption,
  type TableDateRange,
  getDateFromOption,
  TABLE_AGGREGATION_OPTIONS,
  rangeToString,
  rangeFromString,
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

  // Use the new utility function to parse the date range
  const parsedRange = queryParams.dateRange
    ? rangeFromString(
        queryParams.dateRange,
        TABLE_AGGREGATION_OPTIONS,
        defaultDateRange,
      )
    : { range: defaultDateRange };

  const validatedInitialRangeOption =
    "range" in parsedRange ? parsedRange.range : null;

  const [selectedOptionRaw, setSelectedOptionRaw] =
    useSessionStorage<TableDateRangeAggregationOption | null>(
      `tableDateRangeState-${projectId}`,
      validatedInitialRangeOption,
    );

  const selectedOption =
    selectedOptionRaw === null
      ? null
      : TABLE_AGGREGATION_OPTIONS.includes(
            selectedOptionRaw as TableDateRangeAggregationOption,
          )
        ? selectedOptionRaw
        : defaultDateRange;

  const dateFromOption = selectedOption
    ? getDateFromOption({
        filterSource: "TABLE",
        option: selectedOption,
      })
    : null;

  const initialDateRange =
    "from" in parsedRange
      ? parsedRange
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

    const rangeToSerialize =
      option === null && range
        ? range.to
          ? { from: range.from, to: range.to }
          : range.from.toISOString() // Backward compatibility: single timestamp for tables with only 'from'
        : option
          ? { range: option }
          : { range: "last1Day" as const }; // fallback

    const newParam =
      typeof rangeToSerialize === "string"
        ? rangeToSerialize // Handle single timestamp case
        : rangeToString(rangeToSerialize);

    setQueryParams({ dateRange: newParam });
  };

  return { selectedOption, dateRange, setDateRangeAndOption };
}
