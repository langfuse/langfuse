import type {
  BatchActionQuery,
  FilterState,
  OrderByState,
  TracingSearchType,
} from "@langfuse/shared";

type BuildTraceBatchActionQueryInput = {
  filter: FilterState;
  orderBy: OrderByState;
  searchQuery?: string | null;
  searchType: TracingSearchType[];
};

export function buildTraceBatchActionQuery({
  filter,
  orderBy,
  searchQuery,
  searchType,
}: BuildTraceBatchActionQueryInput): BatchActionQuery {
  return {
    filter,
    orderBy,
    searchQuery: searchQuery || undefined,
    searchType,
  };
}
