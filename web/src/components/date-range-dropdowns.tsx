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
  tableDateRangeAggregationSettings,
  dashboardDateRangeAggregationSettings,
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  type DashboardDateRangeOptions,
  type TableDateRangeOptions,
  DASHBOARD_AGGREGATION_OPTIONS,
  TABLE_AGGREGATION_OPTIONS,
} from "@/src/utils/date-range-utils";

type BaseDateRangeDropdownProps<T> = {
  selectedOption: T;
  options: T[];
  onSelectionChange: (value: T) => void;
};

const BaseDateRangeDropdown = <T extends string>({
  selectedOption,
  options,
  onSelectionChange,
}: BaseDateRangeDropdownProps<T>) => {
  return (
    <Select value={selectedOption} onValueChange={onSelectionChange}>
      <SelectTrigger className="w-[115px] hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent position="popper" defaultValue={60}>
        {options.reverse().map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

type DashboardDateRangeDropdownProps = {
  selectedOption: DashboardDateRangeOptions;
  setDateRangeAndOption: (
    option: DashboardDateRangeOptions,
    date?: DashboardDateRange,
  ) => void;
};

export const DashboardDateRangeDropdown: React.FC<
  DashboardDateRangeDropdownProps
> = ({ selectedOption, setDateRangeAndOption }) => {
  const onDropDownSelection = (value: DashboardDateRangeOptions) => {
    if (value === DASHBOARD_AGGREGATION_PLACEHOLDER) {
      setDateRangeAndOption(DASHBOARD_AGGREGATION_PLACEHOLDER, undefined);
      return;
    }
    const setting =
      dashboardDateRangeAggregationSettings[
        value as keyof typeof dashboardDateRangeAggregationSettings
      ];
    setDateRangeAndOption(value, {
      from: addMinutes(new Date(), -setting.minutes),
      to: new Date(),
    });
  };

  return (
    <BaseDateRangeDropdown
      selectedOption={selectedOption}
      options={[
        ...DASHBOARD_AGGREGATION_OPTIONS,
        DASHBOARD_AGGREGATION_PLACEHOLDER,
      ]}
      onSelectionChange={onDropDownSelection}
    />
  );
};

type TableDateRangeDropdownProps = {
  selectedOption: TableDateRangeOptions;
  setDateRangeAndOption: (
    option: TableDateRangeOptions,
    date?: DashboardDateRange,
  ) => void;
};

export const TableDateRangeDropdown: React.FC<TableDateRangeDropdownProps> = ({
  selectedOption,
  setDateRangeAndOption,
}) => {
  const onDropDownSelection = (value: TableDateRangeOptions) => {
    if (value === DEFAULT_AGGREGATION_SELECTION) {
      setDateRangeAndOption(DEFAULT_AGGREGATION_SELECTION, undefined);
      return;
    }
    const setting =
      tableDateRangeAggregationSettings[
        value as keyof typeof tableDateRangeAggregationSettings
      ];
    setDateRangeAndOption(value, {
      from: addMinutes(new Date(), -setting),
      to: new Date(),
    });
  };

  return (
    <BaseDateRangeDropdown
      selectedOption={selectedOption}
      options={[DEFAULT_AGGREGATION_SELECTION, ...TABLE_AGGREGATION_OPTIONS]}
      onSelectionChange={onDropDownSelection}
    />
  );
};
