import { useState } from "react";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import {
  type TableDateRangeOptions,
  isValidTableDateRangeAggregationOption,
  type TableDateRangeAggregationOption,
  type TableDateRange,
  getDateFromOption,
  getAbbreviatedTimeRange,
  getFullTimeRangeFromAbbreviated,
} from "@/src/utils/date-range-utils";
import useSessionStorage from "@/src/components/useSessionStorage";

export interface UseTableDateRangeOutput {
  selectedOption: TableDateRangeOptions;
  dateRange: TableDateRange | undefined;
  setDateRangeAndOption: (
    option: TableDateRangeOptions,
    range?: TableDateRange,
  ) => void;
}

export function useTableDateRange(projectId: string): UseTableDateRangeOutput {
  const [queryParams, setQueryParams] = useQueryParams({
    dateRange: withDefault(StringParam, "Select a date range"),
  });

  const defaultDateRange: TableDateRangeOptions = "last1Day";

  // Try multiple formats for backward compatibility:
  // 1. Abbreviated format (new URLs): "1d" -> "last1Day"
  // 2. Variable name format (current): "last1Day"
  const rangeFromAbbreviated = queryParams.dateRange
    ? getFullTimeRangeFromAbbreviated(queryParams.dateRange)
    : null;

  const validatedInitialRangeOption =
    rangeFromAbbreviated &&
    isValidTableDateRangeAggregationOption(rangeFromAbbreviated)
      ? rangeFromAbbreviated
      : isValidTableDateRangeAggregationOption(queryParams.dateRange)
        ? (queryParams.dateRange as TableDateRangeAggregationOption)
        : defaultDateRange;

  const [selectedOptionRaw, setSelectedOptionRaw] =
    useSessionStorage<TableDateRangeOptions>(
      `tableDateRangeState-${projectId}`,
      validatedInitialRangeOption,
    );

  const isValid = isValidTableDateRangeAggregationOption(selectedOptionRaw);
  const selectedOption = isValid ? selectedOptionRaw : defaultDateRange;

  const dateFromOption = getDateFromOption({
    filterSource: "TABLE",
    option: selectedOption,
  });

  const initialDateRange = !!dateFromOption
    ? { from: dateFromOption }
    : undefined;

  const [dateRange, setDateRange] = useState<TableDateRange | undefined>(
    initialDateRange,
  );
  const setDateRangeAndOption = (
    option: TableDateRangeOptions,
    range?: TableDateRange,
  ) => {
    setSelectedOptionRaw(option);
    setDateRange(range);
    // Store abbreviated format in URL
    const abbreviatedOption = getAbbreviatedTimeRange(option as any);
    setQueryParams({ dateRange: abbreviatedOption });
  };

  return { selectedOption, dateRange, setDateRangeAndOption };
}
