import * as React from "react";
import { addMinutes } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import { tableDateRangeAggregationSettings } from "@/src/components/useDateRange";
import { dashboardDateRangeAggregationSettings } from "@/src/features/dashboard/lib/timeseries-aggregation";
import {
  type AllDateRangeAggregationOption,
  DEFAULT_DATE_RANGE_SELECTION,
  isValidOption,
  type DashboardDateRangeAggregationOption,
  type TableDateRangeAggregationOption,
} from "@/src/utils/date-range-utils";

type DateRangeDropdownProps = {
  type: "dashboard" | "table";
  selectedOption: AllDateRangeAggregationOption;
  setDateRangeAndOption: (
    option: AllDateRangeAggregationOption,
    date?: DashboardDateRange,
  ) => void;
};

const DateRangeDropdown: React.FC<DateRangeDropdownProps> = ({
  type,
  selectedOption,
  setDateRangeAndOption,
}) => {
  const onDropDownSelection = (
    value:
      | DashboardDateRangeAggregationOption
      | TableDateRangeAggregationOption
      | typeof DEFAULT_DATE_RANGE_SELECTION,
  ) => {
    if (isValidOption(value)) {
      let fromDate: Date;
      if (value in dashboardDateRangeAggregationSettings) {
        const setting =
          dashboardDateRangeAggregationSettings[
            value as DashboardDateRangeAggregationOption
          ];
        fromDate = addMinutes(new Date(), -setting.minutes);
      } else if (value in tableDateRangeAggregationSettings) {
        const setting =
          tableDateRangeAggregationSettings[
            value as TableDateRangeAggregationOption
          ];
        fromDate = addMinutes(new Date(), -setting.minutes);
      } else {
        setDateRangeAndOption(DEFAULT_DATE_RANGE_SELECTION, undefined);
        return;
      }
      setDateRangeAndOption(value, {
        from: fromDate,
        to: new Date(),
      });
    } else {
      setDateRangeAndOption(DEFAULT_DATE_RANGE_SELECTION, undefined);
    }
  };

  const dashboardOptions = [
    DEFAULT_DATE_RANGE_SELECTION,
    ...Object.keys(dashboardDateRangeAggregationSettings),
  ] as (
    | DashboardDateRangeAggregationOption
    | typeof DEFAULT_DATE_RANGE_SELECTION
  )[];

  const tableOptions = [
    DEFAULT_DATE_RANGE_SELECTION,
    ...Object.keys(tableDateRangeAggregationSettings),
  ] as (
    | TableDateRangeAggregationOption
    | typeof DEFAULT_DATE_RANGE_SELECTION
  )[];

  const currentOptions = type === "dashboard" ? dashboardOptions : tableOptions;

  return (
    <Select value={String(selectedOption)} onValueChange={onDropDownSelection}>
      <SelectTrigger className="w-[120px] hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent position="popper" defaultValue={60}>
        {currentOptions.reverse().map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default DateRangeDropdown;
