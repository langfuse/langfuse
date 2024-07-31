import * as React from "react";
import { addMinutes } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";

import {
  DEFAULT_AGGREGATION_SELECTION,
  tableDateRangeAggregationSettings,
  dashboardDateRangeAggregationSettings,
  DASHBOARD_AGGREGATION_PLACEHOLDER,
  type DashboardDateRangeOptions,
  type TableDateRangeOptions,
  DASHBOARD_AGGREGATION_OPTIONS,
  TABLE_AGGREGATION_OPTIONS,
  type DashboardDateRange,
} from "@/src/utils/date-range-utils";
import { Clock } from "lucide-react";

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
      <SelectTrigger className="w-[130px] hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0">
        <Clock className="h-4 w-4" />
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent position="popper" defaultValue={60}>
        {options.map((item) => (
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

  const options =
    selectedOption === DASHBOARD_AGGREGATION_PLACEHOLDER
      ? [...DASHBOARD_AGGREGATION_OPTIONS, DASHBOARD_AGGREGATION_PLACEHOLDER]
      : [...DASHBOARD_AGGREGATION_OPTIONS];
  return (
    <BaseDateRangeDropdown
      selectedOption={selectedOption}
      options={options}
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
      options={[...TABLE_AGGREGATION_OPTIONS, DEFAULT_AGGREGATION_SELECTION]}
      onSelectionChange={onDropDownSelection}
    />
  );
};
