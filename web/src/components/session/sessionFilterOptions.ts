import { type FilterState, type TimeFilter } from "@langfuse/shared";

export const isSessionStartTimeFilter = (
  filter: FilterState[number],
): filter is TimeFilter =>
  (filter.column === "Start Time" || filter.column === "startTime") &&
  filter.type === "datetime";

const isLowerBoundStartTimeFilter = (filter: TimeFilter) =>
  filter.operator === ">=" || filter.operator === ">";

export const getSessionFilterOptionsStartTimeFilters = ({
  filterState,
  minTimestamp,
  maxTimestamp,
}: {
  filterState: FilterState;
  minTimestamp: Date;
  maxTimestamp: Date;
}): TimeFilter[] => {
  const explicitStartTimeFilters = filterState.filter(isSessionStartTimeFilter);

  if (explicitStartTimeFilters.some(isLowerBoundStartTimeFilter)) {
    return explicitStartTimeFilters;
  }

  return [
    {
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: minTimestamp,
    },
    ...(explicitStartTimeFilters.length > 0
      ? explicitStartTimeFilters
      : [
          {
            column: "startTime" as const,
            type: "datetime" as const,
            operator: "<=" as const,
            value: maxTimestamp,
          },
        ]),
  ];
};
