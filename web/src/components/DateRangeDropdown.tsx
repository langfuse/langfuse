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

import {
  DEFAULT_AGGREGATION_SELECTION,
  isValidOption,
  type DashboardDateRangeAggregationOption,
  type TableDateRangeAggregationOption,
  tableDateRangeAggregationSettings,
  dashboardDateRangeAggregationSettings,
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  type DateRangeOptions,
} from "@/src/utils/date-range-utils";

type DateRangeDropdownProps = {
  type: "dashboard" | "table";
  selectedOption: DateRangeOptions;
  setDateRangeAndOption: (
    option: DateRangeOptions,
    date?: DashboardDateRange,
  ) => void;
};

const DateRangeDropdown: React.FC<DateRangeDropdownProps> = ({
  type,
  selectedOption,
  setDateRangeAndOption,
}) => {
  const onDropDownSelection = (value: DateRangeOptions) => {
    if (isValidOption(value)) {
      let fromDate: Date;
      if (type === "dashboard") {
        const setting =
          dashboardDateRangeAggregationSettings[
            value as DashboardDateRangeAggregationOption
          ];
        fromDate = addMinutes(new Date(), -setting.minutes);
      } else if (type === "table") {
        if (value.toString() === DEFAULT_AGGREGATION_SELECTION) {
          setDateRangeAndOption(DEFAULT_AGGREGATION_SELECTION, undefined);
          return;
        }
        const setting =
          tableDateRangeAggregationSettings[
            value as TableDateRangeAggregationOption
          ];
        fromDate = addMinutes(new Date(), -setting.minutes);
      } else {
        setDateRangeAndOption(DEFAULT_AGGREGATION_SELECTION, undefined);
        return;
      }
      setDateRangeAndOption(value, {
        from: fromDate,
        to: new Date(),
      });
    } else {
      if (value.toString() === DASHBOARD_AGGREGATION_PLACEHOLDER) {
        setDateRangeAndOption(DASHBOARD_AGGREGATION_PLACEHOLDER, undefined);
        return;
      }
      setDateRangeAndOption(DEFAULT_AGGREGATION_SELECTION, undefined);
    }
  };

  const getOptions = (type: "dashboard" | "table") => {
    if (type === "dashboard") {
      return [
        ...Object.keys(dashboardDateRangeAggregationSettings),
        DASHBOARD_AGGREGATION_PLACEHOLDER,
      ] as (
        | DashboardDateRangeAggregationOption
        | typeof DASHBOARD_AGGREGATION_PLACEHOLDER
      )[];
    } else {
      return [
        DEFAULT_AGGREGATION_SELECTION,
        ...Object.keys(tableDateRangeAggregationSettings),
      ] as (
        | TableDateRangeAggregationOption
        | typeof DEFAULT_AGGREGATION_SELECTION
      )[];
    }
  };

  const currentOptions = getOptions(type);

  return (
    <Select value={selectedOption} onValueChange={onDropDownSelection}>
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
