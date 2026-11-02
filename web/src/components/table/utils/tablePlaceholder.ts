import { type FilterState, type TracingSearchType } from "@langfuse/shared";
import {
  type TableDateRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import isEqual from "lodash/isEqual";

// Keep user intent here; paging, sort and generated window bounds are not scope.
export type TableDataScope = {
  projectId: string;
  filter: FilterState;
  searchQuery?: string | null;
  searchType?: TracingSearchType[];
  timeRange: TimeRange | TableDateRange | undefined;
};

export function tablePlaceholderOptions(scope: TableDataScope) {
  return {
    meta: { tableDataScope: scope },
    placeholderData: <T>(
      previousData: T | undefined,
      previousQuery: { meta?: Record<string, unknown> } | undefined,
    ): T | undefined =>
      isEqual(previousQuery?.meta?.tableDataScope, scope)
        ? previousData
        : undefined,
  };
}
