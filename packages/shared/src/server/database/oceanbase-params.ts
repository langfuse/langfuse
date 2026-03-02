/**
 * Helper function to convert ClickHouse named parameters to MySQL positional parameters
 * This helps when building SQL queries that need to work with both databases
 */

/**
 * Build positional parameter array from named parameters and SQL with ? placeholders
 * @param sql SQL with ? placeholders in order
 * @param namedParams Named parameters object (ClickHouse style)
 * @returns Array of parameter values in the order they appear in SQL
 */
export function buildPositionalParams(): unknown[] {
  const params: unknown[] = [];

  // Extract parameter names from SQL in order they appear
  // SQL should have ? placeholders, and we need to match them with named params
  // This is a simple implementation - assumes params are passed in the correct order
  // For more complex cases, you may need to track parameter order explicitly

  // For now, this is a placeholder - actual implementation depends on how
  // you structure your SQL generation
  // You should pass params in the order they appear in SQL
  return params;
}

/**
 * Convert array parameter to IN clause placeholders and values
 * @param values Array of values
 * @returns Object with placeholders string and values array
 */
export function arrayToInClause(values: unknown[]): {
  placeholders: string;
  values: unknown[];
} {
  if (values.length === 0) {
    return { placeholders: "NULL", values: [] };
  }
  return {
    placeholders: values.map(() => "?").join(", "),
    values,
  };
}
