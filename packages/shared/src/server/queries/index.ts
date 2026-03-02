export {
  type FullObservations,
  type FullObservationsWithScores,
  type FullEventsObservations,
  type ObservationPriceFields,
} from "./createGenerationsQuery";
export {
  FilterList,
  StringFilter,
  DateTimeFilter,
  StringOptionsFilter,
  CategoryOptionsFilter,
  NumberFilter,
  ArrayOptionsFilter,
  BooleanFilter,
  NumberObjectFilter,
  StringObjectFilter,
  NullFilter,
  type ClickhouseOperator,
} from "./clickhouse-sql/clickhouse-filter";
export {
  orderByToClickhouseSql,
  orderByToEntries,
} from "./clickhouse-sql/orderby-factory";
export { createFilterFromFilterState } from "./clickhouse-sql/factory";
export { clickhouseSearchCondition } from "./clickhouse-sql/search";
export {
  convertApiProvidedFilterToClickhouseFilter,
  createPublicApiObservationsColumnMapping,
  createPublicApiTracesColumnMapping,
  deriveFilters,
  type ApiColumnMapping,
} from "./public-api-filter-builder";
export {
  CTEQueryBuilder,
  EventsQueryBuilder,
  EventsAggQueryBuilder,
  EventsAggregationQueryBuilder,
  type CTESchema,
  type CTEWithSchema,
} from "./clickhouse-sql/event-query-builder";

import { isOceanBase } from "../../utils/oceanbase";
if (isOceanBase()) {
  const obFilter = require("./oceanbase-sql/oceanbase-filter") as Record<
    string,
    unknown
  >;
  const obOrderBy = require("./oceanbase-sql/orderby-factory") as Record<
    string,
    unknown
  >;
  const obFactory = require("./oceanbase-sql/factory") as Record<
    string,
    unknown
  >;
  const obSearch = require("./oceanbase-sql/search") as Record<string, unknown>;
  const obPublicApi = require("./public-api-filter-builder-ob") as Record<
    string,
    unknown
  >;
  const obEventBuilder =
    require("./oceanbase-sql/event-query-builder") as Record<string, unknown>;
  const newExports: Record<string, unknown> = {
    ...(module.exports as Record<string, unknown>),
    ...obFilter,
    ...obOrderBy,
    ...obFactory,
    ...obSearch,
    ...obPublicApi,
    ...obEventBuilder,
  };
  if (obSearch.oceanbaseSearchCondition != null) {
    newExports.clickhouseSearchCondition = obSearch.oceanbaseSearchCondition;
  }
  if (obOrderBy.orderByToOceanbaseSql != null) {
    newExports.orderByToClickhouseSql = obOrderBy.orderByToOceanbaseSql;
  }
  module.exports = newExports;
}
