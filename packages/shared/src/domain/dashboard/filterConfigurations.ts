export interface FilterConfiguration {
  id: string;
  column: string;
  table?: string;
  operator: FilterOperator;
  value: any;
  dataType: 'string' | 'number' | 'datetime' | 'boolean';
  isGlobal?: boolean; // Applied to all widgets in dashboard
}

enum FilterOperator {
  EQUALS = '=',
  NOT_EQUALS = '!=',
  GREATER_THAN = '>',
  GREATER_THAN_OR_EQUAL = '>=',
  LESS_THAN = '<',
  LESS_THAN_OR_EQUAL = '<=',
  IN = 'IN',
  NOT_IN = 'NOT IN',
  LIKE = 'LIKE',
  NOT_LIKE = 'NOT LIKE'
}
