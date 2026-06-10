import {
  generateTracesForPublicApi as _generateTracesForPublicApi,
  getTracesCountForPublicApi as _getTracesCountForPublicApi,
  createPublicApiTracesColumnMapping,
  deriveFilters,
  tracesTableUiColumnDefinitions,
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
}: {
  props: TraceQueryType;
  advancedFilters?: FilterState;
  orderBy: OrderByState;
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
    pagination:
      props.limit !== undefined && props.page !== undefined
        ? { limit: props.limit, page: props.page }
        : undefined,
    fields: props.fields,
  });
};

export const getTracesCountForPublicApi = ({
  props,
  advancedFilters,
}: {
  props: TraceQueryType;
  advancedFilters?: FilterState;
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
    pagination:
      props.limit !== undefined && props.page !== undefined
        ? { limit: props.limit, page: props.page }
        : undefined,
  });
};
