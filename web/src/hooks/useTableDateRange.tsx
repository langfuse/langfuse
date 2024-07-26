import { useState } from "react";
import { addMinutes } from "date-fns";
import { useQueryParams, StringParam, withDefault } from "use-query-params";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import {
  type TableDateRangeOptions,
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
  defaultDateRange: TableDateRangeOptions = "24 hours",
): UseTableDateRangeOutput {
  const [queryParams, setQueryParams] = useQueryParams({
    select: withDefault(StringParam, "Select a date range"),
  });

  const validatedInitialRangeOption = isValidTableDateRangeAggregationOption(
    queryParams.select,
  )
    ? (queryParams.select as TableDateRangeAggregationOption)
    : defaultDateRange;

  const [selectedOption, setSelectedOption] = useState<TableDateRangeOptions>(
    validatedInitialRangeOption,
  );
  const initialDateRange = {
    from: addMinutes(
      new Date(),
      -tableDateRangeAggregationSettings[
        validatedInitialRangeOption as keyof typeof tableDateRangeAggregationSettings
      ],
    ),
    to: new Date(),
  };

  const [dateRange, setDateRange] = useState<DashboardDateRange | undefined>(
    initialDateRange,
  );
  const setDateRangeAndOption = (
    option: TableDateRangeOptions,
    range?: DashboardDateRange,
  ) => {
    setSelectedOption(option);
    setDateRange(range);
    setQueryParams({ select: option });
  };

  return { selectedOption, dateRange, setDateRangeAndOption };
}
