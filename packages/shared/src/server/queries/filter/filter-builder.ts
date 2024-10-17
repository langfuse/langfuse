export const datetimeFilterToPrismaSql = (
  safeColumn: string,
  operator: string,
  value: Date
) => {
  return `${safeColumn} ${operator} '${value.toISOString()}::timestamp with time zone at time zone 'UTC''`;
};

export const numberFilterToPrismaSql = (
  safeColumn: string,
  operator: string,
  value: number
) => {
  return `${safeColumn} ${operator} ${value}`;
};

export const stringFilterToPrismaSql = (
  safeColumn: string,
  operator: string,
  value: string
) => {
  const operatorMapping: Record<string, string> = {
    contains: "ILIKE",
    "does not contain": "NOT ILIKE",
    "starts with": "ILIKE",
    "ends with": "ILIKE",
  };
  const sqlOperator = operatorMapping[operator];
  return `${safeColumn} ${sqlOperator} '%${value}%'`;
};

export const arrayFilterToPrismaSql = (
  safeColumn: string,
  operator: string,
  value: string[]
) => {
  const operatorMapping: Record<string, string> = {
    "any of": "&&",
    "none of": "NOT &&",
  };
  const sqlOperator = operatorMapping[operator];
  return `${safeColumn} ${sqlOperator} ARRAY[${value.map((v) => `'${v}'`).join(", ")}]`;
};
