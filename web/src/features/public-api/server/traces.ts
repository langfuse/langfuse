import {
  generateTracesForPublicApi as _generateTracesForPublicApi,
  getTracesCountForPublicApi as _getTracesCountForPublicApi,
  createPublicApiTracesColumnMapping,
  deriveFilters,
  tracesTableUiColumnDefinitions,
  type ClickHouseQueryContextTags,
  type TraceQueryType,
} from "@langfuse/shared/src/server";
import { tracesTableCols } from "@langfuse/shared";
import type { FilterState, OrderByState } from "@langfuse/shared";

const publicApiTracesFilterParams = createPublicApiTracesColumnMapping(
  "traces",
  "t",
);

export const generateTracesForPublicApi = ({
  props,
  advancedFilters,
  orderBy,
  clickHouseQueryTags,
}: {
  props: TraceQueryType;
  advancedFilters?: FilterState;
  orderBy: OrderByState;
  clickHouseQueryTags?: ClickHouseQueryContextTags;
}) => {
  const filter = deriveFilters(
    props,
    publicApiTracesFilterParams,
    advancedFilters,
    tracesTableUiColumnDefinitions,
    tracesTableCols,
  );
  return _generateTracesForPublicApi({
    projectId: props.projectId,
    filter,
    orderBy,
    pagination: { limit: props.limit, page: props.page },
    fields: props.fields,
    clickHouseQueryTags,
  });
};

export const getTracesCountForPublicApi = ({
  props,
  advancedFilters,
  clickHouseQueryTags,
}: {
  props: TraceQueryType;
  advancedFilters?: FilterState;
  clickHouseQueryTags?: ClickHouseQueryContextTags;
}) => {
  const filter = deriveFilters(
    props,
    publicApiTracesFilterParams,
    advancedFilters,
    tracesTableUiColumnDefinitions,
    tracesTableCols,
  );
  return _getTracesCountForPublicApi({
    projectId: props.projectId,
    filter,
    pagination: { limit: props.limit, page: props.page },
    clickHouseQueryTags,
  });
};
