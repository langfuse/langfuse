import { useState, useEffect } from "react";
import { addMinutes } from "date-fns";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import {
  DEFAULT_AGGREGATION_SELECTION,
  type TableDateRangeOptions,
  findClosestTableIntervalToDate,
  tableDateRangeAggregationSettings,
  isValidTableDateRangeAggregationOption,
  type TableDateRangeAggregationOption,
} from "@/src/utils/date-range-utils";

export interface UseTableDateRangeOutput {
  selectedOption: TableDateRangeOptions;
  dateRange: DashboardDateRange | undefined;
  setDateRangeAndOption: (
    option: TableDateRangeOptions,
    range?: DashboardDateRange,
  ) => void;
}

export function useTableDateRange(
  defaultDateRange?: TableDateRangeOptions,
): UseTableDateRangeOutput {
  const [queryParams, setQueryParams] = useQueryParams({
    select: withDefault(StringParam, "Select a date range"),
  });

  const initialRangeOption = defaultDateRange ?? "24 hours";

  const validatedInitialRangeOption = isValidTableDateRangeAggregationOption(
    queryParams.select,
  )
    ? (queryParams.select as TableDateRangeAggregationOption)
    : initialRangeOption;

  const [selectedOption, setSelectedOption] = useState<TableDateRangeOptions>(
    validatedInitialRangeOption,
  );
  const [dateRange, setDateRange] = useState<DashboardDateRange | undefined>();

  const setDateRangeAndOption = (
    option: TableDateRangeOptions,
    range?: DashboardDateRange,
  ) => {
    setSelectedOption(option);
    setDateRange(range);
    setQueryParams({ select: option });
  };

  useEffect(() => {
    if (selectedOption in tableDateRangeAggregationSettings) {
      const minutes =
        tableDateRangeAggregationSettings[
          selectedOption as keyof typeof tableDateRangeAggregationSettings
        ];
      const fromDate = addMinutes(new Date(), -minutes);
      setDateRange({ from: fromDate, to: new Date() });
    }
  }, [selectedOption]);

  return { selectedOption, dateRange, setDateRangeAndOption };
}
