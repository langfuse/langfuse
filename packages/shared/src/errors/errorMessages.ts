/**
 * Shared error messages that can be used in both client and server contexts
 */

/**
 * Standard message for resource limit errors (memory, timeout, etc.)
 * Used when queries require too many resources to complete
 */
export const RESOURCE_LIMIT_ERROR_MESSAGE = [
  "Your query could not be completed.",
  "Please narrow your request by adding more specific filters (e.g., a shorter date range).",
].join(" ");

/**
 * Hint shown for slow-running chart queries after a short delay
 */
export const SLOW_QUERY_HINT_TEXT =
  "This query is taking longer than usual. Try reducing the time frame or adding more filters.";
