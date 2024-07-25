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
  type DashboardDateRangeAggregationOption,
  type TableDateRangeAggregationOption,
  tableDateRangeAggregationSettings,
  dashboardDateRangeAggregationSettings,
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  type DashboardDateRangeOptions,
  type TableDateRangeOptions,
  DASHBOARD_AGGREGATION_OPTIONS,
  TABLE_AGGREGATION_OPTIONS,
} from "@/src/utils/date-range-utils";

type DateRangeDropdownProps = {
  type: "dashboard" | "table";
  selectedOption: DashboardDateRangeOptions | TableDateRangeOptions;
  setDateRangeAndOption:
    | ((option: DashboardDateRangeOptions, date?: DashboardDateRange) => void)
    | ((option: TableDateRangeOptions, date?: DashboardDateRange) => void);
};

const DateRangeDropdown: React.FC<DateRangeDropdownProps> = ({
  type,
  selectedOption,
  setDateRangeAndOption,
}) => {
  const onDropDownDashboardSelection = (value: DashboardDateRangeOptions) => {
    if (value === DASHBOARD_AGGREGATION_PLACEHOLDER) {
      (
        setDateRangeAndOption as (
          option: DashboardDateRangeOptions,
          date?: DashboardDateRange,
        ) => void
      )(DASHBOARD_AGGREGATION_PLACEHOLDER, undefined);
      return;
    }
    const setting =
      dashboardDateRangeAggregationSettings[
        value as DashboardDateRangeAggregationOption
      ];
    (
      setDateRangeAndOption as (
        option: DashboardDateRangeOptions,
        date?: DashboardDateRange,
      ) => void
    )(value, {
      from: addMinutes(new Date(), -setting.minutes),
      to: new Date(),
    });
  };

  const onDropDownTableSelection = (value: TableDateRangeOptions) => {
    if (value === DEFAULT_AGGREGATION_SELECTION) {
      (
        setDateRangeAndOption as (
          option: TableDateRangeOptions,
          date?: DashboardDateRange,
        ) => void
      )(DEFAULT_AGGREGATION_SELECTION, undefined);
      return;
    }
    const setting =
      tableDateRangeAggregationSettings[
        value as TableDateRangeAggregationOption
      ];
    (
      setDateRangeAndOption as (
        option: TableDateRangeOptions,
        date?: DashboardDateRange,
      ) => void
    )(value, {
      from: addMinutes(new Date(), -setting),
      to: new Date(),
    });
  };

  const getOptions = (type: "dashboard" | "table") => {
    if (type === "dashboard") {
      return [
        ...DASHBOARD_AGGREGATION_OPTIONS,
        DASHBOARD_AGGREGATION_PLACEHOLDER,
      ] as DashboardDateRangeOptions[];
    } else {
      return [
        DEFAULT_AGGREGATION_SELECTION,
        ...TABLE_AGGREGATION_OPTIONS,
      ] as TableDateRangeOptions[];
    }
  };

  const currentOptions = getOptions(type);
  const onDropDownSelection =
    type === "dashboard"
      ? onDropDownDashboardSelection
      : onDropDownTableSelection;

  return (
    <Select value={selectedOption} onValueChange={onDropDownSelection}>
      <SelectTrigger className="w-[115px] hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0">
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
