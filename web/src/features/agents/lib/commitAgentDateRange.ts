import { useGlobalDateRangeStore } from "@/src/features/global-time-range/globalDateRangeStore";
import { rangeToString, type TimeRange } from "@/src/utils/date-range-utils";

export function commitAgentDateRange({
  projectId,
  range,
  setQuery,
}: {
  projectId: string;
  range: TimeRange;
  setQuery: (update: {
    dateRange: string;
    page: number;
    peek: undefined;
  }) => void;
}) {
  const dateRange = rangeToString(range);
  setQuery({ dateRange, page: 1, peek: undefined });
  useGlobalDateRangeStore
    .getState()
    .actions.setProjectDefault(projectId, dateRange);
}
