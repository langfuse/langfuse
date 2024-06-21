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
  dateTimeAggregationOptions,
  dateTimeAggregationSettings,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { isValidOption } from "@/src/utils/types";
import {
  DEFAULT_DATE_RANGE_SELECTION,
  type AvailableDateRangeSelections,
} from "@/src/components/date-picker";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]";
import { type AvailableTableDateRangeSelections } from "@/src/components/useDateRange";

type DateRangeDropdownProps = {
  selectedOption:
    | AvailableDateRangeSelections
    | AvailableTableDateRangeSelections;
  setDateRangeAndOption: (
    option: AvailableDateRangeSelections | AvailableTableDateRangeSelections,
    date?: DashboardDateRange,
  ) => void;
};

const DateRangeDropdown: React.FC<DateRangeDropdownProps> = ({
  selectedOption,
  setDateRangeAndOption,
}) => {
  const onDropDownSelection = (value: string) => {
    if (isValidOption(value)) {
      const setting = dateTimeAggregationSettings[value];
      const fromDate = addMinutes(new Date(), -1 * setting.minutes);

      setDateRangeAndOption(value, {
        from: fromDate,
        to: new Date(),
      });
    } else {
      setDateRangeAndOption(DEFAULT_DATE_RANGE_SELECTION, undefined);
    }
  };

  return (
    <Select value={selectedOption} onValueChange={onDropDownSelection}>
      <SelectTrigger className="w-[120px] hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent position="popper" defaultValue={60}>
        <SelectItem
          key={DEFAULT_DATE_RANGE_SELECTION}
          value={DEFAULT_DATE_RANGE_SELECTION}
        >
          {DEFAULT_DATE_RANGE_SELECTION}
        </SelectItem>
        {dateTimeAggregationOptions.toReversed().map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default DateRangeDropdown;
