export interface WidgetConfiguration {
  primaryTable: TableConfig;
  selectedColumns: SelectedColumn[];
  aggregations: AggregationConfig[];
  groupByColumns: GroupByConfig[];
  filters: FilterConfig[];
  joinTables?: JoinConfig[];
  timeSeriesConfig?: TimeSeriesConfig;
  orderBy?: OrderByConfig[];
  limit?: number;
}

export interface TableConfig {
  name: string;
  alias?: string;
  useFinal: boolean;
}

export interface SelectedColumn {
  tableId: string;
  columnId: string;
  alias?: string;
  customExpression?: string;
}

export interface AggregationConfig {
  function: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX" | "COUNT_DISTINCT";
  column: SelectedColumn;
  alias: string;
}

export interface GroupByConfig {
  column: SelectedColumn;
  bucketSize?: "minute" | "hour" | "day" | "week" | "month";
}

export interface FilterConfig {
  column: SelectedColumn;
  operator:
    | "="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "IN"
    | "NOT IN"
    | "LIKE"
    | "NOT LIKE"
    | "BETWEEN";
  value: any;
  isGlobal?: boolean;
}

export interface JoinConfig {
  table: TableConfig;
  joinType: "INNER" | "LEFT" | "RIGHT" | "FULL";
  onCondition: string;
}

export interface TimeSeriesConfig {
  timeColumn: string;
  bucketSize: "minute" | "hour" | "day" | "week" | "month";
  orderBy: "ASC" | "DESC";
  fillGaps: boolean;
}

export interface OrderByConfig {
  column: string;
  direction: "ASC" | "DESC";
}
