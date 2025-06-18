export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
  configuration: WidgetConfiguration;
  filters: FilterConfiguration[];
  refreshInterval?: number;
}

enum WidgetType {
  SCORE_AGGREGATE = 'score_aggregate',
  COST_BY_TIME = 'cost_by_time',
  USAGE_BY_TIME = 'usage_by_time',
  CUSTOM_METRIC = 'custom_metric',
  TABLE_VIEW = 'table_view'
}


interface WidgetSize {
  width: number;
  height: number;
}